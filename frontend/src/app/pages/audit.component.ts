import { DatePipe, JsonPipe } from "@angular/common";
import { Component, computed, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { ButtonModule } from "primeng/button";
import { TagModule } from "primeng/tag";
import {
  ApiService,
  type AuditLogOptions,
  type AuditLogRecord,
} from "../core/api.service";

@Component({
  standalone: true,
  imports: [FormsModule, ButtonModule, TagModule, DatePipe, JsonPipe],
  template: `
    <main class="audit-page">
      <header class="page-header">
        <div>
          <h1>Auditoría</h1>
          <p>Consulta quién realizó cada acción, cuándo ocurrió y qué información técnica quedó registrada.</p>
        </div>
        <div class="actions">
          <p-button label="Exportar CSV" icon="pi pi-download" severity="secondary" (onClick)="exportCsv()" [disabled]="items().length === 0" />
          <p-button label="Actualizar" icon="pi pi-refresh" (onClick)="searchLogs()" [loading]="loading()" />
        </div>
      </header>

      <section class="filter-card">
        <label class="wide">Buscar
          <input [(ngModel)]="search" (keyup.enter)="searchLogs()" placeholder="Acción, entidad, usuario, IP o Request ID" />
        </label>
        <label>Desde
          <input type="datetime-local" [(ngModel)]="from" />
        </label>
        <label>Hasta
          <input type="datetime-local" [(ngModel)]="to" />
        </label>
        <label>Usuario
          <select [(ngModel)]="actorUserId">
            <option value="">Todos</option>
            @for (actor of options().actors; track actor.id) {
              <option [value]="actor.id">{{ actor.displayName }} · {{ actor.email }}</option>
            }
          </select>
        </label>
        <label>Acción
          <select [(ngModel)]="action">
            <option value="">Todas</option>
            @for (value of options().actions; track value) { <option [value]="value">{{ value }}</option> }
          </select>
        </label>
        <label>Entidad
          <select [(ngModel)]="entityType">
            <option value="">Todas</option>
            @for (value of options().entityTypes; track value) { <option [value]="value">{{ value }}</option> }
          </select>
        </label>
        <label>Resultado
          <select [(ngModel)]="result">
            <option value="">Todos</option>
            <option value="SUCCESS">Éxito</option>
            <option value="FAILURE">Error</option>
          </select>
        </label>
        <div class="filter-actions">
          <p-button label="Buscar" icon="pi pi-search" (onClick)="searchLogs()" />
          <p-button label="Limpiar" icon="pi pi-filter-slash" severity="secondary" (onClick)="clearFilters()" />
        </div>
      </section>

      <section class="summary">
        <article><span>Registros encontrados</span><strong>{{ total() }}</strong></article>
        <article><span>Éxitos en esta página</span><strong class="ok">{{ successCount() }}</strong></article>
        <article><span>Errores en esta página</span><strong class="bad">{{ failureCount() }}</strong></article>
        <article><span>Página</span><strong>{{ currentPage() }} / {{ pageCount() }}</strong></article>
      </section>

      <section class="audit-layout" [class.with-detail]="selected()">
        <div class="table-card">
          <div class="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th><th>Usuario</th><th>Acción</th><th>Entidad</th><th>Resultado</th><th>IP</th><th>Detalle</th>
                </tr>
              </thead>
              <tbody>
                @if (!loading() && items().length === 0) {
                  <tr><td colspan="7" class="empty">No hay registros con los filtros seleccionados.</td></tr>
                }
                @for (item of items(); track item.id) {
                  <tr [class.selected]="selected()?.id === item.id">
                    <td><span class="date">{{ item.createdAt | date:'short' }}</span></td>
                    <td>
                      <strong>{{ item.actorName || 'Sistema' }}</strong>
                      <small>{{ item.actorEmail || '' }}</small>
                    </td>
                    <td><code>{{ item.action }}</code></td>
                    <td>
                      <strong>{{ item.entityType }}</strong>
                      <small>{{ item.entityId || '—' }}</small>
                    </td>
                    <td><p-tag [severity]="item.result === 'SUCCESS' ? 'success' : 'danger'" [value]="item.result === 'SUCCESS' ? 'ÉXITO' : 'ERROR'" /></td>
                    <td><small>{{ item.ipAddress || '—' }}</small></td>
                    <td><p-button icon="pi pi-eye" [rounded]="true" [text]="true" title="Ver detalle" (onClick)="selected.set(item)" /></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <footer class="pagination">
            <span>Mostrando {{ rangeStart() }}–{{ rangeEnd() }} de {{ total() }}</span>
            <div>
              <p-button icon="pi pi-chevron-left" severity="secondary" [disabled]="skip() === 0" (onClick)="previousPage()" />
              <select [(ngModel)]="take" (change)="changePageSize()">
                <option [ngValue]="25">25</option><option [ngValue]="50">50</option><option [ngValue]="100">100</option>
              </select>
              <p-button icon="pi pi-chevron-right" severity="secondary" [disabled]="skip() + take >= total()" (onClick)="nextPage()" />
            </div>
          </footer>
        </div>

        @if (selected(); as item) {
          <aside class="detail-card">
            <header><div><strong>Detalle del evento</strong><small>{{ item.createdAt | date:'medium' }}</small></div><button type="button" (click)="selected.set(null)">×</button></header>
            <dl>
              <dt>Acción</dt><dd><code>{{ item.action }}</code></dd>
              <dt>Resultado</dt><dd>{{ item.result }}</dd>
              <dt>Usuario</dt><dd>{{ item.actorName || 'Sistema' }}<br><small>{{ item.actorEmail || '' }}</small></dd>
              <dt>Entidad</dt><dd>{{ item.entityType }}<br><small>{{ item.entityId || 'Sin ID' }}</small></dd>
              <dt>Request ID</dt><dd><code>{{ item.requestId || '—' }}</code></dd>
              <dt>Dirección IP</dt><dd>{{ item.ipAddress || '—' }}</dd>
              <dt>Navegador / cliente</dt><dd class="wrap">{{ item.userAgent || '—' }}</dd>
            </dl>
            <section>
              <h3>Metadata</h3>
              @if (item.metadata) { <pre>{{ item.metadata | json }}</pre> } @else { <p class="muted">Este evento no guardó metadata adicional.</p> }
            </section>
          </aside>
        }
      </section>

      @if (error()) { <div class="error-toast">{{ error() }}</div> }
    </main>
  `,
  styles: [`
    :host{display:block}.audit-page{padding:1.4rem;max-width:1800px;margin:0 auto}.page-header{display:flex;justify-content:space-between;gap:1rem;align-items:center;margin-bottom:1rem}.page-header h1{margin:0}.page-header p{margin:.3rem 0 0;color:#64748b}.actions{display:flex;gap:.5rem}.filter-card{display:grid;grid-template-columns:minmax(260px,1.6fr) repeat(6,minmax(145px,1fr));gap:.7rem;background:#fff;padding:1rem;border:1px solid #e0e6ec;border-radius:.9rem;box-shadow:0 5px 20px rgba(15,23,42,.04)}.filter-card label{display:flex;flex-direction:column;gap:.35rem;font-size:.75rem;font-weight:700;color:#52606d}.filter-card input,.filter-card select,.pagination select{border:1px solid #d7e0e8;border-radius:.55rem;padding:.65rem;background:#fff;min-width:0}.filter-actions{display:flex;align-items:end;gap:.45rem}.summary{display:grid;grid-template-columns:repeat(4,minmax(160px,1fr));gap:.8rem;margin:1rem 0}.summary article{background:#fff;border:1px solid #e0e6ec;border-radius:.8rem;padding:.85rem;display:flex;justify-content:space-between;align-items:center}.summary span{color:#64748b;font-size:.8rem}.summary strong{font-size:1.25rem}.summary .ok{color:#15803d}.summary .bad{color:#b91c1c}.audit-layout{display:grid;grid-template-columns:1fr;gap:1rem}.audit-layout.with-detail{grid-template-columns:minmax(650px,1fr) 380px}.table-card,.detail-card{background:#fff;border:1px solid #e0e6ec;border-radius:.9rem;overflow:hidden}.table-scroll{overflow:auto;max-height:calc(100vh - 360px);min-height:360px}table{width:100%;border-collapse:collapse;min-width:1050px}th,td{padding:.72rem .8rem;border-bottom:1px solid #edf1f4;text-align:left;vertical-align:top}th{position:sticky;top:0;background:#f7f9fb;z-index:1;font-size:.75rem;text-transform:uppercase;color:#637181}td{font-size:.82rem}td strong,td small{display:block}td small{color:#74808c;margin-top:.15rem;max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}tr.selected{background:#eef7ff}.date{white-space:nowrap}code{font-size:.74rem;background:#eef2f6;padding:.18rem .35rem;border-radius:.35rem;overflow-wrap:anywhere}.empty{text-align:center;color:#75818d;padding:3rem}.pagination{display:flex;justify-content:space-between;align-items:center;padding:.7rem .9rem;background:#fafbfd}.pagination span{font-size:.78rem;color:#65727e}.pagination div{display:flex;gap:.45rem;align-items:center}.detail-card{height:fit-content;max-height:calc(100vh - 290px);overflow:auto}.detail-card header{display:flex;justify-content:space-between;align-items:center;padding:1rem;border-bottom:1px solid #e5eaf0}.detail-card header div{display:flex;flex-direction:column}.detail-card header small{color:#74808c;margin-top:.2rem}.detail-card header button{border:0;background:transparent;font-size:1.7rem;cursor:pointer}.detail-card dl{display:grid;grid-template-columns:115px 1fr;gap:.7rem;padding:1rem;margin:0;font-size:.82rem}.detail-card dt{font-weight:700;color:#64748b}.detail-card dd{margin:0;min-width:0}.detail-card .wrap{overflow-wrap:anywhere}.detail-card section{padding:0 1rem 1rem}.detail-card h3{font-size:.9rem}.detail-card pre{background:#0f172a;color:#dbeafe;padding:.8rem;border-radius:.6rem;white-space:pre-wrap;overflow-wrap:anywhere;font-size:.72rem;max-height:300px;overflow:auto}.error-toast{position:fixed;right:1rem;bottom:1rem;background:#fee2e2;color:#991b1b;padding:.8rem 1rem;border-radius:.6rem;box-shadow:0 8px 25px rgba(0,0,0,.15)}@media(max-width:1350px){.filter-card{grid-template-columns:repeat(4,1fr)}.filter-card .wide{grid-column:span 2}.audit-layout.with-detail{grid-template-columns:1fr}.detail-card{max-height:none}}@media(max-width:760px){.audit-page{padding:.8rem}.page-header{align-items:flex-start;flex-direction:column}.filter-card{grid-template-columns:1fr 1fr}.filter-card .wide{grid-column:1/-1}.summary{grid-template-columns:1fr 1fr}}
  `],
})
export class AuditComponent {
  private readonly api = inject(ApiService);
  readonly items = signal<AuditLogRecord[]>([]);
  readonly total = signal(0);
  readonly skip = signal(0);
  readonly loading = signal(false);
  readonly error = signal("");
  readonly selected = signal<AuditLogRecord | null>(null);
  readonly options = signal<AuditLogOptions>({ actions: [], entityTypes: [], actors: [] });
  readonly successCount = computed(() => this.items().filter((item) => item.result === "SUCCESS").length);
  readonly failureCount = computed(() => this.items().filter((item) => item.result !== "SUCCESS").length);
  readonly currentPage = computed(() => Math.floor(this.skip() / this.take) + 1);
  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.total() / this.take)));
  readonly rangeStart = computed(() => this.total() === 0 ? 0 : this.skip() + 1);
  readonly rangeEnd = computed(() => Math.min(this.skip() + this.items().length, this.total()));

  search = "";
  action = "";
  entityType = "";
  result = "";
  actorUserId = "";
  from = "";
  to = "";
  take = 50;

  constructor() {
    this.api.auditLogOptions().subscribe({ next: (value) => this.options.set(value) });
    this.searchLogs();
  }

  searchLogs(reset = true): void {
    if (reset) this.skip.set(0);
    this.loading.set(true);
    this.api.auditLogs({
      search: this.search || undefined,
      action: this.action || undefined,
      entityType: this.entityType || undefined,
      result: this.result || undefined,
      actorUserId: this.actorUserId || undefined,
      from: this.toIso(this.from),
      to: this.toIso(this.to),
      take: this.take,
      skip: this.skip(),
    }).subscribe({
      next: (page) => { this.items.set(page.items); this.total.set(page.total); },
      error: (error) => this.setError(error, "No se pudo consultar la auditoría."),
      complete: () => this.loading.set(false),
    });
  }

  clearFilters(): void {
    this.search = "";
    this.action = "";
    this.entityType = "";
    this.result = "";
    this.actorUserId = "";
    this.from = "";
    this.to = "";
    this.selected.set(null);
    this.searchLogs();
  }

  previousPage(): void {
    this.skip.set(Math.max(0, this.skip() - this.take));
    this.searchLogs(false);
  }

  nextPage(): void {
    if (this.skip() + this.take >= this.total()) return;
    this.skip.set(this.skip() + this.take);
    this.searchLogs(false);
  }

  changePageSize(): void {
    this.skip.set(0);
    this.searchLogs(false);
  }

  exportCsv(): void {
    const headers = ["Fecha", "Usuario", "Email", "Accion", "Entidad", "EntidadId", "Resultado", "IP", "RequestId", "UserAgent", "Metadata"];
    const rows = this.items().map((item) => [
      item.createdAt,
      item.actorName || "Sistema",
      item.actorEmail || "",
      item.action,
      item.entityType,
      item.entityId || "",
      item.result,
      item.ipAddress || "",
      item.requestId || "",
      item.userAgent || "",
      item.metadata ? JSON.stringify(item.metadata) : "",
    ]);
    const csv = [headers, ...rows].map((row) => row.map((value) => this.csvCell(String(value))).join(",")).join("\r\n");
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `auditoria-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  private toIso(value: string): string | undefined {
    return value ? new Date(value).toISOString() : undefined;
  }

  private csvCell(value: string): string {
    return `"${value.replaceAll('"', '""')}"`;
  }

  private setError(error: unknown, fallback: string): void {
    const candidate = error as { error?: { message?: string }; message?: string };
    this.error.set(candidate?.error?.message || candidate?.message || fallback);
    this.loading.set(false);
    setTimeout(() => this.error.set(""), 5000);
  }
}
