import { Component, OnInit, inject, signal } from "@angular/core";
import { DatePipe } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ButtonModule } from "primeng/button";
import { CardModule } from "primeng/card";
import { InputTextModule } from "primeng/inputtext";
import { TableModule } from "primeng/table";
import { MessageService } from "primeng/api";
import {
  ApiService,
  type ExternalConnectorRecord,
  type MediaRecord,
  type RecurringCampaignRecord,
  type SessionRecord,
} from "../core/api.service";

@Component({
  standalone: true,
  imports: [FormsModule, DatePipe, ButtonModule, CardModule, InputTextModule, TableModule],
  template: `
    <main class="page">
      <div class="page-header">
        <div>
          <h1>Envíos recurrentes</h1>
          <div class="muted">Programa un envío que se repite solo: cada cierto tiempo busca votantes nuevos (aún no contactados ni en cola) y les manda el mensaje automáticamente.</div>
        </div>
      </div>

      <div class="grid two campaign-grid">
        <p-card header="Nuevo envío recurrente">
          <form class="form-grid" (ngSubmit)="create()">
            <label for="rc-name">Nombre</label>
            <input pInputText id="rc-name" name="rcName" [(ngModel)]="name" placeholder="Ej.: Bienvenida a nuevos votantes" />

            <label>Fuente de contactos</label>
            @if (sourceConnectors().length) {
              <select [(ngModel)]="selectedConnectorId" name="rcConnector">
                <option value="">Selecciona una fuente de contactos</option>
                @for (connector of sourceConnectors(); track connector.id) {
                  <option [value]="connector.id">{{ connector.name }}</option>
                }
              </select>
              <textarea [(ngModel)]="connectorVariablesJson" name="rcVariables" rows="2" placeholder='{"municipio":"123"}'></textarea>
              <div class="contact-help">Variables JSON fijas para completar la URL/body del conector en cada corrida (ej. filtro de municipio).</div>
            } @else {
              <small>No hay fuentes activas. Creá una en Integraciones → Conectores con el uso "Fuente de contactos".</small>
            }

            <label>Sesiones emisoras</label>
            <div class="session-options">
              @for (session of connectedSessions(); track session.id) {
                <label class="check-row">
                  <input type="checkbox" [checked]="selectedSessionIds().includes(session.id)" (change)="toggleSession(session.id)" />
                  {{ session.name }} — {{ session.phoneE164 || session.status }}
                </label>
              } @empty {
                <div class="muted">Conecta al menos una sesión real.</div>
              }
            </div>

            <label for="rc-message">Mensaje</label>
            <textarea id="rc-message" name="rcMessage" rows="4" [(ngModel)]="messageText" [placeholder]="'Hola {{nombre}}, ...'"></textarea>
            <div class="contact-help">Variables disponibles: {{ '{{nombre}}' }}, {{ '{{telefono}}' }} y las que mapee el conector.</div>

            <label for="rc-caption">Pie de imagen/video (opcional, solo si hay multimedia)</label>
            <input pInputText id="rc-caption" name="rcCaption" [(ngModel)]="messageCaption" />

            <label for="rc-media">Multimedia (opcional)</label>
            <select id="rc-media" name="rcMedia" [(ngModel)]="selectedMediaAssetId">
              <option value="">Sin multimedia</option>
              @for (item of mediaItems(); track item.id) {
                <option [value]="item.id">{{ item.fileName }}</option>
              }
            </select>

            <label for="rc-region">País / región por defecto</label>
            <select id="rc-region" name="rcRegion" [(ngModel)]="defaultRegion">
              @for (region of regionOptions; track region.code) {
                <option [value]="region.code">{{ region.label }}</option>
              }
            </select>

            <label for="rc-interval">Repetir cada</label>
            <select id="rc-interval" name="rcInterval" [(ngModel)]="intervalMinutes">
              @for (preset of intervalPresets; track preset.minutes) {
                <option [value]="preset.minutes">{{ preset.label }}</option>
              }
            </select>
            <div class="contact-help">
              En cada corrida se descarta a quien ya tenga algún mensaje encolado o enviado antes en este sistema, así que solo se le escribe a gente realmente nueva.
            </div>

            <p-button type="submit" label="Crear envío recurrente" icon="pi pi-refresh" [loading]="saving()" [disabled]="saving()" />
          </form>
        </p-card>

        <p-card header="Cómo funciona">
          <div class="how-it-works">
            <div><i class="pi pi-database"></i> <div><strong>1. Consulta</strong><span>Cada intervalo, pregunta a la fuente de contactos por la lista completa de votantes.</span></div></div>
            <div><i class="pi pi-filter"></i> <div><strong>2. Filtra</strong><span>Descarta a quien ya haya sido encolado o contactado antes por cualquier campaña de este sistema.</span></div></div>
            <div><i class="pi pi-send"></i> <div><strong>3. Envía</strong><span>Crea y arranca automáticamente una campaña normal con los contactos realmente nuevos, repartida entre las sesiones elegidas.</span></div></div>
          </div>
        </p-card>
      </div>

      <p-card header="Envíos recurrentes configurados">
        <p-table [value]="recurringCampaigns()" [paginator]="recurringCampaigns().length > 10" [rows]="10">
          <ng-template pTemplate="header">
            <tr>
              <th>Nombre</th>
              <th>Repite</th>
              <th>Estado</th>
              <th>Última corrida</th>
              <th>Resultado</th>
              <th></th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-item>
            <tr>
              <td>
                <strong>{{ item.name }}</strong>
                <div class="muted small">{{ connectorName(item.connectorId) }}</div>
              </td>
              <td>{{ intervalLabel(item.intervalMinutes) }}</td>
              <td><span class="status-pill" [class.paused]="item.status === 'PAUSED'">{{ item.status === 'ACTIVE' ? 'Activo' : 'Pausado' }}</span></td>
              <td>{{ item.lastRunAt ? (item.lastRunAt | date:'short') : 'Todavía no corrió' }}</td>
              <td>
                @if (item.lastRunOutcome) {
                  <span class="outcome" [class]="item.lastRunOutcome.toLowerCase()">{{ outcomeLabel(item) }}</span>
                  @if (item.lastRunOutcome === 'ERROR' && item.lastRunError) {
                    <div class="muted small">{{ item.lastRunError }}</div>
                  }
                } @else {
                  <span class="muted">—</span>
                }
              </td>
              <td class="actions">
                @if (item.status === 'ACTIVE') {
                  <p-button type="button" icon="pi pi-pause" severity="secondary" size="small" [loading]="busyIds().has(item.id)" (onClick)="pause(item)" title="Pausar" />
                } @else {
                  <p-button type="button" icon="pi pi-play" severity="success" size="small" [loading]="busyIds().has(item.id)" (onClick)="resume(item)" title="Reanudar" />
                }
                <p-button type="button" icon="pi pi-trash" severity="danger" size="small" [loading]="busyIds().has(item.id)" (onClick)="remove(item)" title="Eliminar" />
              </td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr><td colspan="6" class="muted">Todavía no configuraste ningún envío recurrente.</td></tr>
          </ng-template>
        </p-table>
      </p-card>
    </main>
  `,
  styles: [`
    .campaign-grid{margin-bottom:1rem}
    .session-options{display:grid;gap:.35rem;max-height:160px;overflow:auto;border:1px solid #e2e8f0;border-radius:8px;padding:.5rem;background:#f8fafc}
    .check-row{display:flex;align-items:center;gap:.45rem;font-size:.85rem;font-weight:400}
    .small{font-size:.78rem}
    .how-it-works{display:grid;gap:.9rem}
    .how-it-works>div{display:flex;gap:.7rem;align-items:flex-start}
    .how-it-works i{margin-top:.2rem;color:#2563eb}
    .how-it-works strong{display:block;font-size:.9rem}
    .how-it-works span{font-size:.82rem;color:#64748b}
    .status-pill.paused{background:#fef3c7;color:#92400e}
    .outcome{font-weight:700;font-size:.82rem}
    .outcome.created{color:#027a48}
    .outcome.empty{color:#64748b}
    .outcome.error{color:#b42318}
    td.actions{display:flex;gap:.4rem}
    @media(max-width:1000px){.campaign-grid{grid-template-columns:1fr}}
  `],
})
export class RecurringCampaignsComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly messages = inject(MessageService);

  readonly sessions = signal<SessionRecord[]>([]);
  readonly connectedSessions = signal<SessionRecord[]>([]);
  readonly selectedSessionIds = signal<string[]>([]);
  readonly sourceConnectors = signal<ExternalConnectorRecord[]>([]);
  readonly mediaItems = signal<MediaRecord[]>([]);
  readonly recurringCampaigns = signal<RecurringCampaignRecord[]>([]);
  readonly saving = signal(false);
  readonly busyIds = signal<Set<string>>(new Set());

  name = "";
  selectedConnectorId = "";
  connectorVariablesJson = "{}";
  messageText = "";
  messageCaption = "";
  selectedMediaAssetId = "";
  intervalMinutes = 60;

  readonly regionOptions = [
    { code: "BO", label: "Bolivia (+591)" },
    { code: "PY", label: "Paraguay (+595)" },
    { code: "AR", label: "Argentina (+54)" },
    { code: "BR", label: "Brasil (+55)" },
    { code: "CL", label: "Chile (+56)" },
    { code: "PE", label: "Perú (+51)" },
    { code: "CO", label: "Colombia (+57)" },
    { code: "EC", label: "Ecuador (+593)" },
    { code: "UY", label: "Uruguay (+598)" },
    { code: "VE", label: "Venezuela (+58)" },
    { code: "MX", label: "México (+52)" },
    { code: "US", label: "Estados Unidos / Canadá (+1)" },
    { code: "ES", label: "España (+34)" },
  ] as const;
  defaultRegion = "BO";

  readonly intervalPresets = [
    { label: "Cada 15 minutos", minutes: 15 },
    { label: "Cada 30 minutos", minutes: 30 },
    { label: "Cada hora", minutes: 60 },
    { label: "Cada 2 horas", minutes: 120 },
    { label: "Cada 6 horas", minutes: 360 },
    { label: "Cada 12 horas", minutes: 720 },
    { label: "Una vez al día", minutes: 1440 },
  ];

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.api.sessions().subscribe((items) => {
      this.sessions.set(items);
      this.connectedSessions.set(items.filter((item) => item.status === "CONNECTED"));
    });
    this.api.externalConnectors({ purpose: "CONTACT_SOURCE", status: "ACTIVE" }).subscribe({
      next: (items) => this.sourceConnectors.set(items),
      error: () => this.sourceConnectors.set([]),
    });
    this.api.media().subscribe({
      next: (items) => this.mediaItems.set(items),
      error: () => this.mediaItems.set([]),
    });
    this.loadRecurring();
  }

  loadRecurring(): void {
    this.api.recurringCampaigns().subscribe({
      next: (items) => this.recurringCampaigns.set(items),
      error: (error: { error?: { message?: string } }) =>
        this.messages.add({ severity: "error", summary: "No se pudo cargar los envíos recurrentes", detail: error.error?.message }),
    });
  }

  toggleSession(id: string): void {
    const current = this.selectedSessionIds();
    this.selectedSessionIds.set(current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  connectorName(id: string): string {
    return this.sourceConnectors().find((connector) => connector.id === id)?.name ?? "Fuente eliminada";
  }

  intervalLabel(minutes: number): string {
    const preset = this.intervalPresets.find((item) => item.minutes === minutes);
    if (preset) return preset.label;
    if (minutes % 1440 === 0) return `Cada ${minutes / 1440} día(s)`;
    if (minutes % 60 === 0) return `Cada ${minutes / 60} h`;
    return `Cada ${minutes} min`;
  }

  outcomeLabel(item: RecurringCampaignRecord): string {
    if (item.lastRunOutcome === "CREATED") {
      return `${item.lastRunContactsNew ?? 0} nuevo(s) de ${item.lastRunContactsFound ?? 0} encontrado(s)`;
    }
    if (item.lastRunOutcome === "EMPTY") {
      return `Sin novedades (${item.lastRunContactsFound ?? 0} encontrado(s), ya contactados)`;
    }
    return "Error en la última corrida";
  }

  create(): void {
    if (!this.name.trim()) {
      this.messages.add({ severity: "warn", summary: "Ingresa un nombre" });
      return;
    }
    if (!this.selectedConnectorId) {
      this.messages.add({ severity: "warn", summary: "Selecciona una fuente de contactos" });
      return;
    }
    if (this.selectedSessionIds().length === 0) {
      this.messages.add({ severity: "warn", summary: "Selecciona al menos una sesión emisora" });
      return;
    }
    if (!this.messageText.trim() && !this.selectedMediaAssetId) {
      this.messages.add({ severity: "warn", summary: "Agrega un mensaje o multimedia" });
      return;
    }

    let variables: Record<string, string> = {};
    if (this.connectorVariablesJson.trim()) {
      try {
        variables = JSON.parse(this.connectorVariablesJson);
      } catch {
        this.messages.add({ severity: "error", summary: "Las variables del conector no son un JSON válido" });
        return;
      }
    }

    this.saving.set(true);
    this.api.createRecurringCampaign({
      name: this.name.trim(),
      connectorId: this.selectedConnectorId,
      connectorVariables: variables,
      sessionIds: this.selectedSessionIds(),
      message: { text: this.messageText, caption: this.messageCaption.trim() || undefined },
      mediaAssetId: this.selectedMediaAssetId || undefined,
      defaultRegion: this.defaultRegion,
      intervalMinutes: this.intervalMinutes,
    }).subscribe({
      next: () => {
        this.saving.set(false);
        this.messages.add({ severity: "success", summary: "Envío recurrente creado" });
        this.resetForm();
        this.loadRecurring();
      },
      error: (error: { error?: { message?: string } }) => {
        this.saving.set(false);
        this.messages.add({ severity: "error", summary: "No se pudo crear el envío recurrente", detail: error.error?.message });
      },
    });
  }

  private resetForm(): void {
    this.name = "";
    this.selectedConnectorId = "";
    this.connectorVariablesJson = "{}";
    this.messageText = "";
    this.messageCaption = "";
    this.selectedMediaAssetId = "";
    this.intervalMinutes = 60;
    this.selectedSessionIds.set([]);
  }

  private setBusy(id: string, busy: boolean): void {
    const current = new Set(this.busyIds());
    if (busy) current.add(id); else current.delete(id);
    this.busyIds.set(current);
  }

  pause(item: RecurringCampaignRecord): void {
    this.setBusy(item.id, true);
    this.api.pauseRecurringCampaign(item.id).subscribe({
      next: () => { this.setBusy(item.id, false); this.loadRecurring(); },
      error: (error: { error?: { message?: string } }) => {
        this.setBusy(item.id, false);
        this.messages.add({ severity: "error", summary: "No se pudo pausar", detail: error.error?.message });
      },
    });
  }

  resume(item: RecurringCampaignRecord): void {
    this.setBusy(item.id, true);
    this.api.resumeRecurringCampaign(item.id).subscribe({
      next: () => { this.setBusy(item.id, false); this.loadRecurring(); },
      error: (error: { error?: { message?: string } }) => {
        this.setBusy(item.id, false);
        this.messages.add({ severity: "error", summary: "No se pudo reanudar", detail: error.error?.message });
      },
    });
  }

  remove(item: RecurringCampaignRecord): void {
    if (!window.confirm(`¿Eliminar el envío recurrente "${item.name}"? Las campañas que ya creó no se borran.`)) return;
    this.setBusy(item.id, true);
    this.api.deleteRecurringCampaign(item.id).subscribe({
      next: () => { this.setBusy(item.id, false); this.loadRecurring(); },
      error: (error: { error?: { message?: string } }) => {
        this.setBusy(item.id, false);
        this.messages.add({ severity: "error", summary: "No se pudo eliminar", detail: error.error?.message });
      },
    });
  }
}
