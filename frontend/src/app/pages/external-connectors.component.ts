import { DatePipe } from "@angular/common";
import { Component, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { ButtonModule } from "primeng/button";
import { TagModule } from "primeng/tag";
import {
  ApiService,
  type ExternalConnectorExecutionRecord,
  type ExternalConnectorOutcome,
  type ExternalConnectorPurpose,
  type ExternalConnectorRecord,
  type ExternalConnectorTestResult,
} from "../core/api.service";

@Component({
  selector: "app-external-connectors",
  standalone: true,
  imports: [FormsModule, ButtonModule, TagModule, DatePipe],
  template: `
    <section class="connector-layout">
      <form class="connector-form" (submit)="$event.preventDefault(); create()">
        <header><div><h2>Nuevo conector saliente</h2><p>Consulta una API externa desde campañas o desde el bot.</p></div></header>

        <label>Nombre<input [(ngModel)]="name" name="connectorName" placeholder="Consulta de recinto electoral" /></label>
        <div class="two-columns">
          <label>Uso
            <select [(ngModel)]="purpose" name="purpose">
              <option value="BOT_LOOKUP">Consulta del bot</option>
              <option value="CONTACT_SOURCE">Fuente de contactos</option>
              <option value="GENERAL">Uso general</option>
            </select>
          </label>
          <label>Método
            <select [(ngModel)]="method" name="method"><option value="GET">GET</option><option value="POST">POST</option></select>
          </label>
        </div>

        <label>URL<input [(ngModel)]="urlTemplate" name="urlTemplate" [placeholder]="'https://sistema/api/recinto?ci={{ci}}'" /></label>
        <small class="help">Puedes insertar variables del flujo o de la importación, por ejemplo <code>{{ '{{ci}}' }}</code>.</small>

        <label>Encabezados JSON<textarea [(ngModel)]="headersJson" name="headersJson" rows="4"></textarea></label>
        @if (method === 'POST') {
          <label>Body JSON<textarea [(ngModel)]="bodyTemplate" name="bodyTemplate" rows="5" [placeholder]="bodyPlaceholder"></textarea></label>
        }

        <div class="two-columns">
          <label>Autenticación
            <select [(ngModel)]="authType" name="authType">
              <option value="NONE">Sin autenticación</option>
              <option value="BEARER">Bearer token</option>
              <option value="API_KEY">API key en encabezado</option>
              <option value="BASIC">Usuario y contraseña Basic</option>
            </select>
          </label>
          <label>Timeout (ms)<input type="number" min="1000" max="30000" [(ngModel)]="timeoutMs" name="timeoutMs" /></label>
        </div>
        @if (authType === 'API_KEY' || authType === 'BASIC') {
          <label>{{ authType === 'API_KEY' ? 'Nombre del encabezado' : 'Usuario' }}<input [(ngModel)]="authName" name="authName" [placeholder]="authType === 'API_KEY' ? 'x-api-key' : 'usuario'" /></label>
        }
        @if (authType !== 'NONE') {
          <label>{{ authType === 'BASIC' ? 'Contraseña' : 'Token o clave' }}<input type="password" [(ngModel)]="secret" name="secret" /></label>
        }

        @if (purpose === 'CONTACT_SOURCE') {
          <fieldset>
            <legend>Mapeo para contactos</legend>
            <label>Ruta de la lista<input [(ngModel)]="itemsPath" name="itemsPath" placeholder="data.personas" /></label>
            <div class="two-columns">
              <label>Ruta del teléfono<input [(ngModel)]="phonePath" name="phonePath" placeholder="telefono" /></label>
              <label>Ruta del nombre<input [(ngModel)]="namePath" name="namePath" placeholder="nombre" /></label>
            </div>
            <label>Variables adicionales<textarea [(ngModel)]="contactMappingsText" name="contactMappings" rows="4" placeholder="fechaReunion=fecha_reunion&#10;hora=hora_reunion"></textarea></label>
            <small class="help">Una línea por mapeo: ruta JSON=variable de campaña.</small>
          </fieldset>
        }

        <p-button type="submit" label="Guardar conector" icon="pi pi-save" [loading]="saving()" />
      </form>

      <div class="connector-content">
        <header class="content-header">
          <div><h2>Conectores configurados</h2><p>Las credenciales se guardan cifradas y nunca vuelven a mostrarse.</p></div>
          <p-button label="Actualizar" icon="pi pi-refresh" severity="secondary" [loading]="loading()" (onClick)="load()" />
        </header>

        <div class="connector-cards">
          @for (connector of connectors(); track connector.id) {
            <article [class.disabled]="connector.status !== 'ACTIVE'">
              <div class="card-head">
                <div><strong>{{ connector.name }}</strong><small>{{ purposeLabel(connector.purpose) }} · {{ connector.method }}</small></div>
                <p-tag [severity]="connector.status === 'ACTIVE' ? 'success' : 'secondary'" [value]="connector.status" />
              </div>
              <code class="url">{{ connector.urlTemplate }}</code>
              <div class="meta"><span>Timeout: {{ connector.timeoutMs }} ms</span><span>Credencial: {{ connector.hasSecret ? 'Configurada' : 'No requerida' }}</span></div>
              <div class="actions">
                <p-button label="Probar" icon="pi pi-play" size="small" (onClick)="openTest(connector)" />
                <p-button [label]="connector.status === 'ACTIVE' ? 'Desactivar' : 'Activar'" severity="secondary" size="small" (onClick)="toggle(connector)" />
              </div>
            </article>
          } @empty {
            <div class="empty">Todavía no existen conectores salientes.</div>
          }
        </div>

        @if (testingConnector(); as connector) {
          <section class="test-panel">
            <header><div><h3>Probar: {{ connector.name }}</h3><p>Usa JSON con los valores que sustituyen variables como <code>{{ '{{ci}}' }}</code>.</p></div><button type="button" (click)="closeTest()">×</button></header>
            <textarea [(ngModel)]="testVariablesJson" rows="5"></textarea>
            <p-button label="Ejecutar prueba" icon="pi pi-play" [loading]="testing()" (onClick)="runTest(connector)" />
            @if (testResult(); as result) {
              <div class="test-result" [class.bad]="result.outcome === 'ERROR'">
                <div><p-tag [severity]="outcomeSeverity(result.outcome)" [value]="result.outcome" /><b>{{ result.httpStatus || 'Sin HTTP' }}</b><span>{{ result.durationMs }} ms</span></div>
                <p>{{ result.errorMessage || 'La llamada terminó correctamente.' }}</p>
                @if (result.preview) { <pre>{{ result.preview }}</pre> }
              </div>
            }
          </section>
        }

        <section class="history">
          <header><h2>Últimas ejecuciones</h2><select [(ngModel)]="historyOutcome" (change)="loadHistory()"><option value="">Todos</option><option value="SUCCESS">SUCCESS</option><option value="NOT_FOUND">NOT_FOUND</option><option value="ERROR">ERROR</option></select></header>
          <div class="table-scroll"><table><thead><tr><th>Fecha</th><th>Conector</th><th>Contexto</th><th>Resultado</th><th>HTTP</th><th>Duración</th><th>Mapeados</th><th>Error</th></tr></thead><tbody>
            @for (item of executions(); track item.id) {
              <tr><td>{{ item.createdAt | date:'short' }}</td><td>{{ item.connectorName }}</td><td>{{ item.contextType }}</td><td><p-tag [severity]="outcomeSeverity(item.outcome)" [value]="item.outcome" /></td><td>{{ item.responseStatus || '—' }}</td><td>{{ item.durationMs }} ms</td><td>{{ item.mappedCount }}</td><td>{{ item.errorMessage || '—' }}</td></tr>
            } @empty { <tr><td colspan="8" class="empty">Todavía no hay ejecuciones.</td></tr> }
          </tbody></table></div>
        </section>
      </div>
    </section>

    @if (error()) { <div class="toast error">{{ error() }}</div> }
    @if (success()) { <div class="toast success">{{ success() }}</div> }
  `,
  styles: [`
    :host{display:block}.connector-layout{display:grid;grid-template-columns:390px 1fr;gap:1rem}.connector-form,.connector-content,.test-panel,.history{background:#fff;border:1px solid #e0e6ec;border-radius:.9rem;padding:1rem}.connector-form{display:grid;gap:.65rem;align-self:start}.connector-form h2,.connector-content h2,.history h2{margin:0}.connector-form p,.content-header p,.test-panel p{margin:.25rem 0;color:#64748b}.connector-form label{display:grid;gap:.3rem;font-size:.8rem;font-weight:700}.connector-form input,.connector-form select,.connector-form textarea,.test-panel textarea,.history select{width:100%;border:1px solid #cfd8e3;border-radius:.55rem;padding:.65rem;background:#fff}.two-columns{display:grid;grid-template-columns:1fr 1fr;gap:.6rem}.help{color:#64748b}.help code{background:#eef2f6;padding:.1rem .25rem;border-radius:.3rem}fieldset{border:1px solid #dce4ec;border-radius:.65rem;display:grid;gap:.55rem}legend{font-weight:800;color:#334155}.content-header,.history>header,.test-panel>header{display:flex;justify-content:space-between;gap:1rem;align-items:center}.connector-cards{display:grid;grid-template-columns:repeat(2,minmax(280px,1fr));gap:.75rem;margin-top:1rem}.connector-cards article{border:1px solid #dfe6ed;border-radius:.75rem;padding:.8rem;display:grid;gap:.65rem}.connector-cards article.disabled{opacity:.68}.card-head{display:flex;justify-content:space-between;gap:.8rem}.card-head div{display:grid}.card-head small,.meta{color:#64748b;font-size:.75rem}.url{display:block;overflow-wrap:anywhere;background:#f8fafc;padding:.55rem;border-radius:.45rem}.meta,.actions{display:flex;gap:.5rem;flex-wrap:wrap;justify-content:space-between}.test-panel{margin-top:1rem;border-color:#93c5fd}.test-panel header button{border:0;background:transparent;font-size:1.7rem;cursor:pointer}.test-result{margin-top:.7rem;background:#f0fdf4;border:1px solid #86efac;border-radius:.65rem;padding:.7rem}.test-result.bad{background:#fef2f2;border-color:#fecaca}.test-result>div{display:flex;gap:.7rem;align-items:center}.test-result pre{max-height:280px;overflow:auto;background:#0f172a;color:#e2e8f0;padding:.7rem;border-radius:.5rem;white-space:pre-wrap}.history{margin-top:1rem}.table-scroll{overflow:auto}table{width:100%;border-collapse:collapse;min-width:850px}th,td{text-align:left;padding:.65rem;border-bottom:1px solid #edf1f4;font-size:.78rem}th{background:#f8fafc;color:#64748b;text-transform:uppercase}.empty{text-align:center;color:#64748b;padding:1.5rem}.toast{position:fixed;right:1rem;bottom:1rem;padding:.8rem 1rem;border-radius:.65rem;z-index:80}.toast.error{background:#fee2e2;color:#991b1b}.toast.success{background:#dcfce7;color:#166534}@media(max-width:1100px){.connector-layout{grid-template-columns:1fr}.connector-cards{grid-template-columns:1fr}}@media(max-width:650px){.two-columns{grid-template-columns:1fr}.content-header,.history>header{align-items:flex-start;flex-direction:column}}
  `],
})
export class ExternalConnectorsComponent {
  private readonly api = inject(ApiService);
  readonly connectors = signal<ExternalConnectorRecord[]>([]);
  readonly executions = signal<ExternalConnectorExecutionRecord[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly testing = signal(false);
  readonly error = signal("");
  readonly success = signal("");
  readonly testingConnector = signal<ExternalConnectorRecord | null>(null);
  readonly testResult = signal<ExternalConnectorTestResult | null>(null);
  readonly bodyPlaceholder = '{"ci":"{{ci}}"}';

  name = "";
  purpose: ExternalConnectorPurpose = "BOT_LOOKUP";
  method: "GET" | "POST" = "GET";
  urlTemplate = "";
  headersJson = "{}";
  bodyTemplate = "";
  authType: "NONE" | "BEARER" | "API_KEY" | "BASIC" = "NONE";
  authName = "";
  secret = "";
  timeoutMs = 10000;
  itemsPath = "data";
  phonePath = "telefono";
  namePath = "nombre";
  contactMappingsText = "";
  testVariablesJson = "{}";
  historyOutcome: "" | ExternalConnectorOutcome = "";

  constructor() { this.load(); }

  load(): void {
    this.loading.set(true);
    this.api.externalConnectors().subscribe({
      next: (items) => this.connectors.set(items),
      error: (error: { error?: { message?: string } }) => {
        this.showError(error.error?.message || "No se pudieron cargar los conectores.");
        this.loading.set(false);
      },
      complete: () => this.loading.set(false),
    });
    this.loadHistory();
  }

  loadHistory(): void {
    this.api.externalConnectorExecutions({ outcome: this.historyOutcome || undefined, take: 100 }).subscribe({
      next: (page) => this.executions.set(page.items),
      error: (error: { error?: { message?: string } }) => this.showError(error.error?.message || "No se pudo cargar el historial."),
    });
  }

  create(): void {
    let headers: Record<string, string>;
    try { headers = this.parseObject(this.headersJson, "encabezados"); }
    catch (error) { this.showError(error instanceof Error ? error.message : String(error)); return; }
    const mappingLines = this.contactMappingsText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (mappingLines.some((line) => line.indexOf("=") <= 0)) {
      this.showError("Los mapeos deben tener el formato ruta=variable.");
      return;
    }
    const mappings = mappingLines.map((line) => {
      const separator = line.indexOf("=");
      return { sourcePath: line.slice(0, separator).trim(), targetVariable: line.slice(separator + 1).trim() };
    });
    if (mappings.some((item) => !item.sourcePath || !item.targetVariable)) {
      this.showError("Los mapeos deben tener el formato ruta=variable.");
      return;
    }
    this.saving.set(true);
    this.api.createExternalConnector({
      name: this.name,
      purpose: this.purpose,
      method: this.method,
      urlTemplate: this.urlTemplate,
      headers,
      bodyTemplate: this.method === "POST" ? this.bodyTemplate || undefined : undefined,
      authType: this.authType,
      authName: this.authName || undefined,
      secret: this.secret || undefined,
      timeoutMs: this.timeoutMs,
      itemsPath: this.purpose === "CONTACT_SOURCE" ? this.itemsPath || undefined : undefined,
      phonePath: this.purpose === "CONTACT_SOURCE" ? this.phonePath || undefined : undefined,
      namePath: this.purpose === "CONTACT_SOURCE" ? this.namePath || undefined : undefined,
      contactMappings: this.purpose === "CONTACT_SOURCE" ? mappings : [],
    }).subscribe({
      next: () => { this.reset(); this.success.set("Conector guardado correctamente."); this.load(); },
      error: (error: { error?: { message?: string } }) => { this.showError(error.error?.message || "No se pudo guardar el conector."); this.saving.set(false); },
      complete: () => this.saving.set(false),
    });
  }

  toggle(connector: ExternalConnectorRecord): void {
    const status = connector.status === "ACTIVE" ? "DISABLED" : "ACTIVE";
    this.api.setExternalConnectorStatus(connector.id, status).subscribe({ next: () => this.load(), error: (error: { error?: { message?: string } }) => this.showError(error.error?.message || "No se pudo cambiar el estado.") });
  }

  openTest(connector: ExternalConnectorRecord): void { this.testingConnector.set(connector); this.testResult.set(null); }
  closeTest(): void { this.testingConnector.set(null); this.testResult.set(null); }

  runTest(connector: ExternalConnectorRecord): void {
    let variables: Record<string, string>;
    try { variables = this.parseObject(this.testVariablesJson, "variables"); }
    catch (error) { this.showError(error instanceof Error ? error.message : String(error)); return; }
    this.testing.set(true);
    this.api.testExternalConnector(connector.id, variables).subscribe({
      next: (result) => { this.testResult.set(result); this.loadHistory(); },
      error: (error: { error?: { message?: string } }) => { this.showError(error.error?.message || "La prueba no pudo ejecutarse."); this.testing.set(false); },
      complete: () => this.testing.set(false),
    });
  }

  purposeLabel(value: ExternalConnectorPurpose): string {
    return value === "BOT_LOOKUP" ? "Consulta del bot" : value === "CONTACT_SOURCE" ? "Fuente de contactos" : "Uso general";
  }
  outcomeSeverity(value: ExternalConnectorOutcome): "success" | "warn" | "danger" {
    return value === "SUCCESS" ? "success" : value === "NOT_FOUND" ? "warn" : "danger";
  }

  private parseObject(value: string, label: string): Record<string, string> {
    const parsed: unknown = JSON.parse(value || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(`El JSON de ${label} debe ser un objeto.`);
    const output: Record<string, string> = {};
    for (const [key, item] of Object.entries(parsed)) {
      if (typeof item !== "string" && typeof item !== "number" && typeof item !== "boolean") throw new Error(`El valor ${key} de ${label} debe ser texto, número o booleano.`);
      output[key] = String(item);
    }
    return output;
  }

  private reset(): void {
    this.name = ""; this.purpose = "BOT_LOOKUP"; this.method = "GET"; this.urlTemplate = ""; this.headersJson = "{}"; this.bodyTemplate = ""; this.authType = "NONE"; this.authName = ""; this.secret = ""; this.timeoutMs = 10000; this.contactMappingsText = "";
  }
  private showError(message: string): void { this.error.set(message); setTimeout(() => this.error.set(""), 5000); }
}
