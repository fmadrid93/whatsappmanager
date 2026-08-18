import { DatePipe, JsonPipe } from "@angular/common";
import { Component, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { ButtonModule } from "primeng/button";
import { CardModule } from "primeng/card";
import { TagModule } from "primeng/tag";
import {
  ApiService,
  type IntegrationApiKeyRecord,
  type IntegrationProbeResult,
  type IntegrationRequestLogRecord,
  type IntegrationSummary,
  type WebhookDeliveryRecord,
  type WebhookEndpointRecord,
} from "../core/api.service";
import { ExternalConnectorsComponent } from "./external-connectors.component";

@Component({
  standalone: true,
  imports: [FormsModule, ButtonModule, CardModule, TagModule, DatePipe, JsonPipe, ExternalConnectorsComponent],
  template: `
    <main class="integration-page">
      <header class="page-header">
        <div>
          <h1>Integraciones</h1>
          <p>Estado técnico, conectores salientes, API keys, webhooks y trazabilidad.</p>
        </div>
        <p-button label="Actualizar" icon="pi pi-refresh" severity="secondary" [loading]="loading()" (onClick)="refreshCurrentTab()" />
      </header>

      <nav class="tabs">
        <button [class.active]="tab() === 'status'" (click)="openTab('status')"><i class="pi pi-heart-fill"></i> Estado del sistema</button>
        <button [class.active]="tab() === 'connectors'" (click)="openTab('connectors')"><i class="pi pi-database"></i> Conectores</button>
        <button [class.active]="tab() === 'keys'" (click)="openTab('keys')"><i class="pi pi-key"></i> API Keys</button>
        <button [class.active]="tab() === 'webhooks'" (click)="openTab('webhooks')"><i class="pi pi-send"></i> Webhooks</button>
        <button [class.active]="tab() === 'history'" (click)="openTab('history')"><i class="pi pi-history"></i> Historial</button>
      </nav>

      @if (tab() === 'status') {
        <section class="status-page">
          <div class="summary-grid">
            <article><span>API keys activas</span><strong>{{ summary()?.activeApiKeys ?? 0 }}</strong></article>
            <article><span>Webhooks activos</span><strong>{{ summary()?.activeWebhooks ?? 0 }}</strong></article>
            <article><span>Entregas pendientes</span><strong>{{ summary()?.pendingDeliveries ?? 0 }}</strong></article>
            <article><span>Entregas fallidas</span><strong class="danger">{{ summary()?.failedDeliveries ?? 0 }}</strong></article>
            <article><span>Peticiones últimas 24 h</span><strong>{{ summary()?.requests24h ?? 0 }}</strong></article>
            <article><span>Peticiones fallidas 24 h</span><strong class="danger">{{ summary()?.failedRequests24h ?? 0 }}</strong></article>
          </div>

          <section class="probe-header">
            <div><h2>Diagnóstico técnico</h2><p>Comprueba SQL Server, almacenamiento, Workers y sesiones conectadas.</p></div>
            <p-button label="Ejecutar prueba" icon="pi pi-play" [loading]="probeLoading()" (onClick)="runProbe()" />
          </section>
          <div class="notice">La prueba de almacenamiento crea un objeto privado pequeño, lo lee y lo elimina. En modo MOCK utiliza el almacenamiento local compartido.</div>

          @if (probe(); as data) {
            <section class="probe-grid">
              <p-card header="Decisión"><p-tag [severity]="data.decision === 'PASS' ? 'success' : 'danger'" [value]="data.decision" /><p>Modos reales: <b>{{ data.realModes ? 'Sí' : 'No' }}</b></p><small>{{ data.generatedAt | date:'medium' }}</small></p-card>
              <p-card header="Base de datos"><p-tag [severity]="severity(data.checks.database.status)" [value]="data.checks.database.status" /><p>{{ data.checks.database.durationMs }} ms</p><small>{{ data.checks.database.message || 'Consulta correcta.' }}</small></p-card>
              <p-card header="Almacenamiento"><p-tag [severity]="severity(data.checks.storage.status)" [value]="data.checks.storage.status" /><p>{{ data.checks.storage.durationMs }} ms</p><small>{{ data.checks.storage.message || 'Correcto.' }}</small></p-card>
              <p-card header="Workers"><p-tag [severity]="severity(data.checks.workers.status)" [value]="data.checks.workers.status" /><p>{{ data.checks.workers.activeCount }} activos</p><small>{{ data.checks.workers.message || '-' }}</small></p-card>
              <p-card header="Sesiones"><p-tag [severity]="severity(data.checks.sessions.status)" [value]="data.checks.sessions.status" /><p>{{ data.checks.sessions.connected }} / {{ data.checks.sessions.total }}</p><small>{{ data.checks.sessions.message || '-' }}</small></p-card>
            </section>
          }

          <section class="api-contract">
            <div>
              <h2>Contrato de campañas externas</h2>
              <p>Utiliza una API key administrada y una clave de idempotencia distinta por campaña.</p>
            </div>
            <pre>POST /api/integrations/campaigns
X-Integration-Key: wsk_live_...
Content-Type: application/json

{{ integrationExample }}</pre>
          </section>
        </section>
      }

      @if (tab() === 'connectors') {
        <app-external-connectors />
      }

      @if (tab() === 'keys') {
        <section class="management-grid">
          <div class="form-card">
            <h2>Nueva API key</h2>
            <p>La clave completa se muestra una sola vez. Guárdala en el sistema que realizará la integración.</p>
            <label>Nombre<input [(ngModel)]="keyName" placeholder="ERP Cobranza" /></label>
            <label>Vencimiento opcional<input type="datetime-local" [(ngModel)]="keyExpiresAt" /></label>
            <div class="check-list">
              <label><input type="checkbox" [(ngModel)]="keyCampaignCreate" /> Crear campañas</label>
              <label><input type="checkbox" [(ngModel)]="keyCampaignStatus" /> Consultar estado de campañas</label>
            </div>
            <p-button label="Crear API key" icon="pi pi-key" [loading]="saving()" (onClick)="createKey()" />
          </div>

          <div class="list-card">
            <header><h2>API keys</h2><span>{{ apiKeys().length }}</span></header>
            @if (createdSecret()) {
              <div class="secret-box">
                <strong>Guarda esta clave ahora</strong>
                <code>{{ createdSecret() }}</code>
                <div><p-button label="Copiar" icon="pi pi-copy" size="small" (onClick)="copy(createdSecret())" /><p-button label="Ocultar" severity="secondary" size="small" (onClick)="createdSecret.set('')" /></div>
              </div>
            }
            <div class="table-scroll">
              <table>
                <thead><tr><th>Nombre</th><th>Prefijo</th><th>Permisos</th><th>Último uso</th><th>Estado</th><th></th></tr></thead>
                <tbody>
                  @for (key of apiKeys(); track key.id) {
                    <tr>
                      <td><strong>{{ key.name }}</strong><small>{{ key.createdAt | date:'short' }}</small></td>
                      <td><code>{{ key.keyPrefix }}…</code></td>
                      <td>{{ key.permissions.join(', ') }}</td>
                      <td>{{ key.lastUsedAt ? (key.lastUsedAt | date:'short') : 'Nunca' }}</td>
                      <td><p-tag [severity]="key.status === 'ACTIVE' ? 'success' : 'secondary'" [value]="key.status" /></td>
                      <td><p-button label="Revocar" severity="danger" size="small" [disabled]="key.status !== 'ACTIVE'" (onClick)="revokeKey(key)" /></td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        </section>
      }

      @if (tab() === 'webhooks') {
        <section class="management-grid webhooks-grid">
          <div class="form-card">
            <h2>Nuevo webhook</h2>
            <label>Nombre<input [(ngModel)]="webhookName" placeholder="ERP Producción" /></label>
            <label>URL<input [(ngModel)]="webhookUrl" placeholder="https://erp.ejemplo.com/webhooks/whatsapp" /></label>
            <div class="events">
              <strong>Eventos</strong>
              @for (event of supportedEvents(); track event) {
                <label><input type="checkbox" [checked]="webhookEvents.includes(event)" (change)="toggleEvent(event, $event)" /> {{ event }}</label>
              }
            </div>
            <p-button label="Crear webhook" icon="pi pi-plus" [loading]="saving()" (onClick)="createWebhook()" />
          </div>

          <div class="list-card">
            <header><h2>Endpoints configurados</h2><span>{{ webhooks().length }}</span></header>
            @if (createdWebhookSecret()) {
              <div class="secret-box">
                <strong>Secret HMAC del webhook</strong>
                <code>{{ createdWebhookSecret() }}</code>
                <div><p-button label="Copiar" icon="pi pi-copy" size="small" (onClick)="copy(createdWebhookSecret())" /><p-button label="Ocultar" severity="secondary" size="small" (onClick)="createdWebhookSecret.set('')" /></div>
              </div>
            }
            <div class="webhook-list">
              @for (webhook of webhooks(); track webhook.id) {
                <article>
                  <div class="webhook-main">
                    <div><strong>{{ webhook.name }}</strong><code>{{ webhook.url }}</code></div>
                    <p-tag [severity]="webhook.status === 'ACTIVE' ? 'success' : 'secondary'" [value]="webhook.status" />
                  </div>
                  <div class="event-chips">@for (event of webhook.events; track event) { <span>{{ event }}</span> }</div>
                  <div class="webhook-meta"><span>Último éxito: {{ webhook.lastSuccessAt ? (webhook.lastSuccessAt | date:'short') : '—' }}</span><span>Último fallo: {{ webhook.lastFailureAt ? (webhook.lastFailureAt | date:'short') : '—' }}</span></div>
                  <div class="webhook-actions">
                    <p-button label="Probar" icon="pi pi-play" size="small" (onClick)="testWebhook(webhook)" />
                    <p-button [label]="webhook.status === 'ACTIVE' ? 'Desactivar' : 'Activar'" severity="secondary" size="small" (onClick)="toggleWebhook(webhook)" />
                    <p-button label="Ver entregas" icon="pi pi-list" severity="secondary" size="small" (onClick)="filterDeliveries(webhook.id)" />
                  </div>
                </article>
              }
            </div>
          </div>
        </section>

        <section class="delivery-card">
          <header><div><h2>Entregas de webhooks</h2><p>Respuesta HTTP, reintentos y errores del endpoint receptor.</p></div><div><select [(ngModel)]="deliveryStatus" (change)="loadDeliveries()"><option value="">Todos los estados</option><option value="PENDING">PENDING</option><option value="PROCESSING">PROCESSING</option><option value="DELIVERED">DELIVERED</option><option value="FAILED">FAILED</option></select><p-button label="Limpiar filtro" severity="secondary" size="small" (onClick)="clearDeliveryFilter()" /></div></header>
          <div class="table-scroll">
            <table>
              <thead><tr><th>Fecha</th><th>Webhook</th><th>Evento</th><th>Estado</th><th>Intentos</th><th>HTTP</th><th>Error</th><th></th></tr></thead>
              <tbody>
                @for (delivery of deliveries(); track delivery.id) {
                  <tr><td>{{ delivery.createdAt | date:'short' }}</td><td>{{ delivery.webhookName }}</td><td><code>{{ delivery.eventType }}</code></td><td><p-tag [severity]="deliverySeverity(delivery.status)" [value]="delivery.status" /></td><td>{{ delivery.attemptCount }}</td><td>{{ delivery.responseStatus || '—' }}</td><td class="error-cell">{{ delivery.lastError || delivery.responseBody || '—' }}</td><td><p-button label="Reintentar" size="small" severity="secondary" [disabled]="delivery.status !== 'FAILED'" (onClick)="retryDelivery(delivery)" /></td></tr>
                }
              </tbody>
            </table>
          </div>
        </section>
      }

      @if (tab() === 'history') {
        <section class="history-card">
          <header><div><h2>Peticiones externas</h2><p>Historial de uso de las API keys y resultados HTTP.</p></div><select [(ngModel)]="requestStatusCode" (change)="loadRequests()"><option value="">Todos los códigos</option><option value="200">200</option><option value="201">201</option><option value="400">400</option><option value="401">401</option><option value="409">409</option><option value="500">500</option></select></header>
          <div class="table-scroll">
            <table>
              <thead><tr><th>Fecha</th><th>API key</th><th>Método</th><th>Endpoint</th><th>HTTP</th><th>Duración</th><th>Idempotencia</th><th>Error</th></tr></thead>
              <tbody>
                @if (requestLogs().length === 0) { <tr><td colspan="8" class="empty">Todavía no hay peticiones externas registradas.</td></tr> }
                @for (item of requestLogs(); track item.id) {
                  <tr><td>{{ item.createdAt | date:'short' }}</td><td>{{ item.apiKeyName || 'Clave heredada .env' }}</td><td><code>{{ item.method }}</code></td><td>{{ item.endpoint }}</td><td><span class="http" [class.bad]="item.statusCode >= 400">{{ item.statusCode }}</span></td><td>{{ item.durationMs }} ms</td><td><code>{{ item.idempotencyKey || '—' }}</code></td><td class="error-cell">{{ item.errorMessage || '—' }}</td></tr>
                }
              </tbody>
            </table>
          </div>
        </section>
      }

      @if (error()) { <div class="error-toast">{{ error() }}</div> }
      @if (success()) { <div class="success-toast">{{ success() }}</div> }
    </main>
  `,
  styles: [`
    :host{display:block}.integration-page{padding:1.4rem;max-width:1800px;margin:0 auto}.page-header{display:flex;justify-content:space-between;align-items:center;gap:1rem}.page-header h1{margin:0}.page-header p{margin:.3rem 0;color:#64748b}.tabs{display:flex;gap:.4rem;border-bottom:1px solid #dbe3ea;margin:1rem 0}.tabs button{border:0;background:transparent;padding:.8rem 1rem;border-bottom:3px solid transparent;cursor:pointer;color:#5c6977;font-weight:600}.tabs button.active{color:#1565c0;border-color:#2196f3}.tabs i{margin-right:.35rem}.summary-grid{display:grid;grid-template-columns:repeat(6,minmax(150px,1fr));gap:.75rem}.summary-grid article{background:#fff;border:1px solid #e0e6ec;border-radius:.8rem;padding:.9rem}.summary-grid span{display:block;color:#697684;font-size:.78rem}.summary-grid strong{font-size:1.5rem}.danger{color:#b91c1c}.probe-header,.delivery-card header,.history-card header{display:flex;justify-content:space-between;align-items:center;gap:1rem;margin-top:1.2rem}.probe-header h2,.delivery-card h2,.history-card h2{margin:0}.probe-header p,.delivery-card p,.history-card p{margin:.25rem 0;color:#64748b}.notice{padding:.8rem;background:#eff6ff;border:1px solid #bfdbfe;border-radius:.65rem;margin:.7rem 0}.probe-grid{display:grid;grid-template-columns:repeat(5,minmax(190px,1fr));gap:.8rem}.probe-grid p{margin:.7rem 0 .2rem}.probe-grid small{color:#64748b}.api-contract{display:grid;grid-template-columns:1fr 1.3fr;gap:1rem;background:#fff;border:1px solid #e0e6ec;border-radius:.9rem;padding:1rem;margin-top:1rem}.api-contract h2{margin-top:0}.api-contract pre{background:#0f172a;color:#e2e8f0;padding:1rem;border-radius:.65rem;white-space:pre-wrap;overflow-wrap:anywhere}.management-grid{display:grid;grid-template-columns:360px 1fr;gap:1rem}.form-card,.list-card,.delivery-card,.history-card{background:#fff;border:1px solid #e0e6ec;border-radius:.9rem;padding:1rem}.form-card h2,.list-card h2{margin-top:0}.form-card p{color:#64748b;font-size:.82rem}.form-card label{display:flex;flex-direction:column;gap:.35rem;font-size:.8rem;font-weight:700;margin:.7rem 0}.form-card input,.delivery-card select,.history-card select{border:1px solid #d7e0e8;border-radius:.55rem;padding:.65rem;background:#fff}.check-list,.events{display:grid;gap:.45rem;margin:.8rem 0}.check-list label,.events label{flex-direction:row;align-items:center;margin:0;font-weight:500}.list-card>header{display:flex;justify-content:space-between}.list-card>header span{background:#e8edf2;border-radius:99px;padding:.2rem .55rem}.secret-box{background:#fff7d6;border:1px solid #f4d35e;border-radius:.7rem;padding:.8rem;margin:.7rem 0;display:grid;gap:.55rem}.secret-box code{word-break:break-all;background:#fff;padding:.55rem;border-radius:.4rem}.secret-box div{display:flex;gap:.45rem}.table-scroll{overflow:auto}table{width:100%;border-collapse:collapse;min-width:850px}th,td{text-align:left;padding:.68rem;border-bottom:1px solid #edf1f4;font-size:.8rem;vertical-align:top}th{font-size:.72rem;text-transform:uppercase;color:#64748b;background:#f8fafc}td strong,td small{display:block}td small{color:#74808c}.webhook-list{display:grid;gap:.7rem}.webhook-list article{border:1px solid #e2e8ee;border-radius:.7rem;padding:.8rem}.webhook-main{display:flex;justify-content:space-between;gap:.8rem}.webhook-main div{display:grid;gap:.3rem;min-width:0}.webhook-main code{overflow-wrap:anywhere}.event-chips{display:flex;gap:.35rem;flex-wrap:wrap;margin:.6rem 0}.event-chips span{font-size:.67rem;background:#eef3f8;border-radius:99px;padding:.2rem .45rem}.webhook-meta{display:flex;gap:1rem;color:#6b7785;font-size:.75rem}.webhook-actions{display:flex;gap:.45rem;margin-top:.7rem;flex-wrap:wrap}.delivery-card,.history-card{margin-top:1rem}.delivery-card header select,.history-card header select{min-width:160px}.delivery-card header>div:last-child{display:flex;gap:.5rem}.error-cell{max-width:320px;white-space:normal;overflow-wrap:anywhere}.http{font-weight:700;color:#15803d}.http.bad{color:#b91c1c}.empty{text-align:center;padding:2rem;color:#74808c}.error-toast,.success-toast{position:fixed;right:1rem;bottom:1rem;padding:.8rem 1rem;border-radius:.65rem;box-shadow:0 8px 25px rgba(0,0,0,.17);z-index:50}.error-toast{background:#fee2e2;color:#991b1b}.success-toast{background:#dcfce7;color:#166534}@media(max-width:1300px){.summary-grid{grid-template-columns:repeat(3,1fr)}.probe-grid{grid-template-columns:repeat(3,1fr)}}@media(max-width:900px){.management-grid,.api-contract{grid-template-columns:1fr}.probe-grid{grid-template-columns:1fr 1fr}.tabs{overflow:auto}.tabs button{white-space:nowrap}}@media(max-width:650px){.integration-page{padding:.8rem}.page-header,.probe-header,.delivery-card header,.history-card header{align-items:flex-start;flex-direction:column}.summary-grid,.probe-grid{grid-template-columns:1fr 1fr}}
  `],
})
export class IntegrationsComponent {
  private readonly api = inject(ApiService);
  readonly tab = signal<"status" | "connectors" | "keys" | "webhooks" | "history">("status");
  readonly loading = signal(false);
  readonly probeLoading = signal(false);
  readonly saving = signal(false);
  readonly error = signal("");
  readonly success = signal("");
  readonly summary = signal<IntegrationSummary | null>(null);
  readonly probe = signal<IntegrationProbeResult | null>(null);
  readonly apiKeys = signal<IntegrationApiKeyRecord[]>([]);
  readonly webhooks = signal<WebhookEndpointRecord[]>([]);
  readonly supportedEvents = signal<string[]>([]);
  readonly deliveries = signal<WebhookDeliveryRecord[]>([]);
  readonly requestLogs = signal<IntegrationRequestLogRecord[]>([]);
  readonly createdSecret = signal("");
  readonly createdWebhookSecret = signal("");

  keyName = "";
  keyExpiresAt = "";
  keyCampaignCreate = true;
  keyCampaignStatus = true;
  webhookName = "";
  webhookUrl = "";
  webhookEvents: string[] = ["INTEGRATION_CAMPAIGN_CREATED", "CAMPAIGN_STARTED", "MESSAGE_SENT", "MESSAGE_FAILED"];
  deliveryWebhookId = "";
  deliveryStatus = "";
  requestStatusCode = "";

  readonly integrationExample = JSON.stringify({
    idempotencyKey: "erp-cobranza-2026-07-001",
    name: "Cobranza julio",
    sessionIds: ["UUID_SESION"],
    message: { text: "Hola {{nombre}}, tu saldo es {{saldo}}." },
    defaultRegion: "BO",
    contacts: [{ phone: "59170000001", name: "Ana", variables: { saldo: "150 Bs" } }],
  }, null, 2);

  constructor() {
    this.loadSummary();
    this.runProbe();
  }

  openTab(value: "status" | "connectors" | "keys" | "webhooks" | "history"): void {
    this.tab.set(value);
    this.refreshCurrentTab();
  }

  refreshCurrentTab(): void {
    this.loadSummary();
    if (this.tab() === "status") this.runProbe();
    if (this.tab() === "keys") this.loadKeys();
    if (this.tab() === "webhooks") { this.loadWebhooks(); this.loadDeliveries(); }
    if (this.tab() === "history") this.loadRequests();
  }

  loadSummary(): void {
    this.api.integrationSummary().subscribe({ next: (value) => this.summary.set(value) });
  }

  runProbe(): void {
    this.probeLoading.set(true);
    this.api.integrationProbe().subscribe({
      next: (result) => this.probe.set(result),
      error: (error) => {
        const payload = error?.error as IntegrationProbeResult | undefined;
        if (payload?.checks) this.probe.set(payload);
        this.setError(error, "Una o más integraciones no superaron la prueba.");
      },
      complete: () => this.probeLoading.set(false),
    });
  }

  loadKeys(): void {
    this.loading.set(true);
    this.api.integrationApiKeys().subscribe({
      next: (items) => this.apiKeys.set(items),
      error: (error) => this.setError(error, "No se pudieron cargar las API keys."),
      complete: () => this.loading.set(false),
    });
  }

  createKey(): void {
    const permissions = [
      ...(this.keyCampaignCreate ? ["CAMPAIGN_CREATE"] : []),
      ...(this.keyCampaignStatus ? ["CAMPAIGN_STATUS"] : []),
    ];
    if (!this.keyName.trim() || permissions.length === 0) return;
    this.saving.set(true);
    this.api.createIntegrationApiKey({
      name: this.keyName.trim(),
      permissions,
      expiresAt: this.keyExpiresAt ? new Date(this.keyExpiresAt).toISOString() : undefined,
    }).subscribe({
      next: (created) => {
        this.createdSecret.set(created.secret ?? "");
        this.keyName = "";
        this.keyExpiresAt = "";
        this.flashSuccess("API key creada. Guarda la clave antes de ocultarla.");
        this.loadKeys();
      },
      error: (error) => this.setError(error, "No se pudo crear la API key."),
      complete: () => this.saving.set(false),
    });
  }

  revokeKey(key: IntegrationApiKeyRecord): void {
    if (!confirm(`¿Revocar la API key ${key.name}? El sistema externo dejará de funcionar inmediatamente.`)) return;
    this.api.revokeIntegrationApiKey(key.id).subscribe({
      next: () => { this.flashSuccess("API key revocada."); this.loadKeys(); },
      error: (error) => this.setError(error, "No se pudo revocar la API key."),
    });
  }

  loadWebhooks(): void {
    this.loading.set(true);
    this.api.integrationWebhooks().subscribe({
      next: (result) => { this.webhooks.set(result.items); this.supportedEvents.set(result.supportedEvents); },
      error: (error) => this.setError(error, "No se pudieron cargar los webhooks."),
      complete: () => this.loading.set(false),
    });
  }

  toggleEvent(event: string, domEvent: Event): void {
    const checked = (domEvent.target as HTMLInputElement).checked;
    this.webhookEvents = checked
      ? [...new Set([...this.webhookEvents, event])]
      : this.webhookEvents.filter((value) => value !== event);
  }

  createWebhook(): void {
    if (!this.webhookName.trim() || !this.webhookUrl.trim() || this.webhookEvents.length === 0) return;
    this.saving.set(true);
    this.api.createIntegrationWebhook({ name: this.webhookName.trim(), url: this.webhookUrl.trim(), events: this.webhookEvents }).subscribe({
      next: (created) => {
        this.createdWebhookSecret.set(created.secret ?? "");
        this.webhookName = "";
        this.webhookUrl = "";
        this.flashSuccess("Webhook creado. Guarda el secret para verificar las firmas HMAC.");
        this.loadWebhooks();
      },
      error: (error) => this.setError(error, "No se pudo crear el webhook."),
      complete: () => this.saving.set(false),
    });
  }

  testWebhook(webhook: WebhookEndpointRecord): void {
    this.api.testIntegrationWebhook(webhook.id).subscribe({
      next: () => { this.flashSuccess("Prueba encolada. Revisa la tabla de entregas."); setTimeout(() => this.loadDeliveries(), 2500); },
      error: (error) => this.setError(error, "No se pudo encolar la prueba."),
    });
  }

  toggleWebhook(webhook: WebhookEndpointRecord): void {
    this.api.updateIntegrationWebhook(webhook.id, { status: webhook.status === "ACTIVE" ? "DISABLED" : "ACTIVE" }).subscribe({
      next: () => this.loadWebhooks(),
      error: (error) => this.setError(error, "No se pudo cambiar el estado del webhook."),
    });
  }

  filterDeliveries(webhookId: string): void {
    this.deliveryWebhookId = webhookId;
    this.loadDeliveries();
  }

  clearDeliveryFilter(): void {
    this.deliveryWebhookId = "";
    this.deliveryStatus = "";
    this.loadDeliveries();
  }

  loadDeliveries(): void {
    this.api.webhookDeliveries({
      webhookId: this.deliveryWebhookId || undefined,
      status: this.deliveryStatus || undefined,
      take: 200,
    }).subscribe({
      next: (page) => this.deliveries.set(page.items),
      error: (error) => this.setError(error, "No se pudieron cargar las entregas."),
    });
  }

  retryDelivery(delivery: WebhookDeliveryRecord): void {
    this.api.retryWebhookDelivery(delivery.id).subscribe({
      next: () => { this.flashSuccess("Entrega reencolada."); setTimeout(() => this.loadDeliveries(), 1000); },
      error: (error) => this.setError(error, "No se pudo reencolar la entrega."),
    });
  }

  loadRequests(): void {
    this.loading.set(true);
    const parsed = Number.parseInt(this.requestStatusCode, 10);
    this.api.integrationRequests({ statusCode: Number.isFinite(parsed) ? parsed : undefined, take: 250 }).subscribe({
      next: (page) => this.requestLogs.set(page.items),
      error: (error) => this.setError(error, "No se pudo cargar el historial de integraciones."),
      complete: () => this.loading.set(false),
    });
  }

  copy(value: string): void {
    void navigator.clipboard.writeText(value).then(() => this.flashSuccess("Copiado al portapapeles."));
  }

  severity(status: string): "success" | "danger" | "warn" | "secondary" {
    if (status === "PASS") return "success";
    if (status === "FAIL") return "danger";
    if (status === "SKIPPED") return "secondary";
    return "warn";
  }

  deliverySeverity(status: string): "success" | "danger" | "warn" | "secondary" {
    if (status === "DELIVERED") return "success";
    if (status === "FAILED") return "danger";
    if (status === "PENDING" || status === "PROCESSING") return "warn";
    return "secondary";
  }

  private setError(error: unknown, fallback: string): void {
    const candidate = error as { error?: { message?: string }; message?: string };
    this.error.set(candidate?.error?.message || candidate?.message || fallback);
    this.loading.set(false);
    this.probeLoading.set(false);
    this.saving.set(false);
    setTimeout(() => this.error.set(""), 6000);
  }

  private flashSuccess(message: string): void {
    this.success.set(message);
    setTimeout(() => this.success.set(""), 3500);
  }
}
