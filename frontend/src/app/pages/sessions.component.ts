import { Component, OnDestroy, OnInit, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { ButtonModule } from "primeng/button";
import { CardModule } from "primeng/card";
import { InputTextModule } from "primeng/inputtext";
import { TableModule } from "primeng/table";
import { MessageService } from "primeng/api";
import { ApiService, type SessionRecord } from "../core/api.service";

@Component({
  standalone: true,
  imports: [FormsModule, ButtonModule, CardModule, InputTextModule, TableModule],
  template: `
    <main class="page">
      <div class="page-header">
        <div>
          <h1>Sesiones de WhatsApp</h1>
          <div class="muted">El número real se confirma después de vincular el dispositivo.</div>
        </div>
        @if (gatewayMode()) {
          <span class="mode-pill" [class.real]="gatewayMode() === 'BAILEYS'">Modo {{ gatewayMode() }}</span>
        }
      </div>

      @if (gatewayMode() === 'MOCK') {
        <div class="notice warning">
          Estás en modo MOCK: no se genera un QR real. Cambia <code>WHATSAPP_GATEWAY_MODE=BAILEYS</code> y reinicia la plataforma.
        </div>
      }

      <div class="grid two">
        <p-card header="Crear sesión">
          <form class="form-grid" (ngSubmit)="create()">
            <label for="name">Nombre interno</label>
            <input pInputText id="name" name="name" [(ngModel)]="name" placeholder="Ventas Santa Cruz" />

            <label for="expected-phone">Número esperado (opcional para QR)</label>
            <input
              pInputText
              id="expected-phone"
              name="expectedPhone"
              [(ngModel)]="expectedPhone"
              placeholder="+59170000000"
            />
            <small class="muted">No asigna el número: sirve para verificar qué cuenta conectaste y es obligatorio para código.</small>

            <label for="pairing-method">Método de vinculación</label>
            <select id="pairing-method" name="pairingMethod" [(ngModel)]="pairingMethod">
              <option value="QR">Código QR</option>
              <option value="CODE">Código numérico</option>
            </select>

            <p-button
              type="submit"
              [label]="pairingMethod === 'QR' ? 'Crear y generar QR' : 'Crear y generar código'"
              icon="pi pi-plus"
              [loading]="saving()"
              [disabled]="gatewayMode() === 'MOCK'"
            />
          </form>
        </p-card>

        <p-card header="Vinculación">
          <div class="qr-box">
            @if (selectedQr()) {
              <img [src]="selectedQr()" alt="Código QR de WhatsApp" />
            } @else if (selectedPairingCode()) {
              <div class="pairing-code">{{ selectedPairingCode() }}</div>
              <div class="muted">WhatsApp → Dispositivos vinculados → Vincular con número de teléfono.</div>
            } @else {
              <div class="muted">Crea una sesión o selecciona “Ver vinculación”.</div>
            }
          </div>

          @if (selectedStatus()) {
            <div class="status-line"><strong>Estado:</strong> {{ selectedStatus() }}</div>
          }
          @if (selectedError()) {
            <div class="notice danger">
              <strong>Error {{ selectedErrorCode() || '' }}</strong><br />{{ selectedError() }}
              @if (selectedErrorCode() === 405) {
                <div class="muted">El rechazo ocurrió antes de que WhatsApp emitiera el QR. Usa “Revincular” para un intento limpio.</div>
              }
            </div>
          }
        </p-card>
      </div>

      <p-card header="Sesiones registradas" styleClass="session-table">
        <p-table [value]="sessions()" [tableStyle]="{ 'min-width': '1050px' }">
          <ng-template #header>
            <tr>
              <th>Nombre</th>
              <th>Número esperado</th>
              <th>Número conectado</th>
              <th>Método</th>
              <th>Estado</th>
              <th>Bot</th>
              <th>Acciones</th>
            </tr>
          </ng-template>
          <ng-template #body let-session>
            <tr>
              <td>{{ session.name }}</td>
              <td>{{ session.expectedPhoneE164 || '—' }}</td>
              <td>
                {{ session.phoneE164 || '—' }}
                @if (phoneMismatch(session)) { <div class="mismatch">No coincide</div> }
              </td>
              <td>{{ session.pairingMethod }}</td>
              <td>
                <span class="status-pill" [class.quarantine]="session.status === 'QUARANTINED'">{{ sessionStatusLabel(session.status) }}</span>
                @if (session.status === 'QUARANTINED' && session.lastConnectionCode === 463) {
                  <div class="quarantine-note">
                    WhatsApp rechazó los envíos automatizados (463). El uso normal desde el celular puede seguir funcionando.
                    El bot quedó pausado para evitar nuevos rechazos.
                  </div>
                } @else if (session.status === 'QUARANTINED') {
                  <div class="quarantine-note">Envíos retenidos. Revisa la causa antes de reanudar.</div>
                }
                @if (session.lastConnectionCode && session.status !== 'CONNECTED') {
                  <div class="muted">Código {{ session.lastConnectionCode }}</div>
                }
                @if (session.lastConnectionError && session.status === 'QUARANTINED') {
                  <div class="muted">{{ session.lastConnectionError }}</div>
                }
              </td>
              <td>{{ session.isBotActive ? 'Activo' : 'Pausado' }}</td>
              <td>
                <div class="actions">
                  <p-button
                    label="Ver vinculación"
                    icon="pi pi-qrcode"
                    size="small"
                    [outlined]="true"
                    (onClick)="watchPairing(session)"
                  />
                  @if (session.pairingMethod === 'CODE' && session.status !== 'CONNECTED') {
                    <p-button label="Nuevo código" size="small" severity="secondary" (onClick)="requestCode(session)" />
                  }
                  <p-button
                    [label]="session.isBotActive ? 'Pausar bot' : 'Activar bot'"
                    size="small"
                    severity="secondary"
                    [disabled]="session.status !== 'CONNECTED' && !session.isBotActive"
                    (onClick)="toggleBot(session)"
                  />
                  <p-button label="Revincular" size="small" severity="warn" [text]="true" (onClick)="relink(session)" />
                  <p-button label="Eliminar" size="small" severity="danger" [text]="true" (onClick)="remove(session)" />
                </div>
              </td>
            </tr>
          </ng-template>
        </p-table>
      </p-card>
    </main>
  `,
  styles: [`
    .session-table { display: block; margin-top: 1rem; }
    .mode-pill { padding: .35rem .65rem; border-radius: 999px; background: #fff3cd; font-weight: 700; }
    .mode-pill.real { background: #d1fae5; color: #065f46; }
    .notice { padding: .8rem 1rem; border-radius: .55rem; margin: .75rem 0; }
    .notice.warning { background: #fff7d6; color: #6b4f00; }
    .notice.danger { background: #fee2e2; color: #991b1b; }
    .pairing-code { font-size: 2rem; font-weight: 800; letter-spacing: .25rem; margin-bottom: .75rem; }
    .status-line { margin-top: .75rem; }
    .mismatch { color: #b91c1c; font-size: .78rem; font-weight: 700; }
    .status-pill.quarantine { background: #fee2e2; color: #991b1b; }
    .quarantine-note { color: #991b1b; font-size: .76rem; max-width: 210px; margin-top: .2rem; }
    .actions { display: flex; flex-wrap: wrap; gap: .35rem; }
    select { width: 100%; padding: .65rem; border: 1px solid #cbd5e1; border-radius: .4rem; background: white; }
  `],
})
export class SessionsComponent implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly messages = inject(MessageService);
  readonly sessions = signal<SessionRecord[]>([]);
  readonly saving = signal(false);
  readonly selectedQr = signal<string | null>(null);
  readonly selectedPairingCode = signal<string | null>(null);
  readonly selectedStatus = signal("");
  readonly selectedError = signal("");
  readonly selectedErrorCode = signal<number | undefined>(undefined);
  readonly gatewayMode = signal("");

  name = "";
  expectedPhone = "";
  pairingMethod: "QR" | "CODE" = "QR";
  private pairingTimer?: ReturnType<typeof setInterval>;
  private selectedSessionId?: string;

  ngOnInit(): void {
    this.load();
    this.api.version().subscribe((value) => this.gatewayMode.set(value.modes.whatsappGateway));
  }

  ngOnDestroy(): void {
    if (this.pairingTimer) clearInterval(this.pairingTimer);
  }

  load(): void {
    this.api.sessions().subscribe((items) => this.sessions.set(items));
  }

  create(): void {
    if (!this.name.trim()) return;
    if (this.pairingMethod === "CODE" && !this.expectedPhone.trim()) {
      this.messages.add({ severity: "warn", summary: "Ingresa el número para generar el código" });
      return;
    }
    this.saving.set(true);
    this.api.createSession({
      name: this.name,
      expectedPhone: this.expectedPhone.trim() || undefined,
      pairingMethod: this.pairingMethod,
    }).subscribe({
      next: (session) => {
        this.name = "";
        this.expectedPhone = "";
        this.load();
        this.watchPairing(session);
        this.messages.add({ severity: "success", summary: "Sesión creada" });
      },
      error: (error: { error?: { message?: string } }) => {
        this.messages.add({ severity: "error", summary: "No se pudo crear", detail: error.error?.message });
        this.saving.set(false);
      },
      complete: () => this.saving.set(false),
    });
  }

  watchPairing(session: SessionRecord): void {
    this.selectedSessionId = session.id;
    this.selectedQr.set(null);
    this.selectedPairingCode.set(null);
    this.selectedError.set("");
    if (this.pairingTimer) clearInterval(this.pairingTimer);
    this.refreshPairing();
    this.pairingTimer = setInterval(() => this.refreshPairing(), 2500);
  }

  requestCode(session: SessionRecord): void {
    this.api.requestPairingCode(session.id, session.expectedPhoneE164).subscribe({
      next: (result) => {
        this.selectedSessionId = session.id;
        this.selectedPairingCode.set(result.code);
        this.watchPairing(session);
      },
      error: (error: { error?: { message?: string } }) =>
        this.messages.add({ severity: "error", summary: "No se pudo generar", detail: error.error?.message }),
    });
  }

  toggleBot(session: SessionRecord): void {
    this.api.setSessionBot(session.id, !session.isBotActive).subscribe({
      next: () => this.load(),
      error: (error: { error?: { message?: string } }) =>
        this.messages.add({ severity: "error", summary: "No se pudo cambiar el bot", detail: error.error?.message }),
    });
  }

  relink(session: SessionRecord): void {
    this.api.relinkSession(session.id).subscribe(() => {
      this.load();
      this.watchPairing(session);
    });
  }

  remove(session: SessionRecord): void {
    if (!window.confirm(`¿Eliminar la sesión “${session.name}”?`)) return;
    this.api.deleteSession(session.id).subscribe(() => {
      if (this.selectedSessionId === session.id) this.clearSelection();
      this.load();
      this.messages.add({ severity: "success", summary: "Sesión eliminada" });
    });
  }

  sessionStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      NEW: "NUEVA",
      CONNECTING: "CONECTANDO",
      CONNECTED: "CONECTADA",
      DISCONNECTED: "DESCONECTADA",
      LOGGED_OUT: "SESIÓN CERRADA",
      QUARANTINED: "CUARENTENA",
      QR_REQUIRED: "QR REQUERIDO",
      PAIRING_CODE: "CÓDIGO REQUERIDO",
      PAIRING_FAILED: "VINCULACIÓN FALLIDA",
      DELETED: "ELIMINADA",
    };
    return labels[status] ?? status;
  }

  phoneMismatch(session: SessionRecord): boolean {
    return Boolean(
      session.expectedPhoneE164 &&
      session.phoneE164 &&
      session.expectedPhoneE164 !== session.phoneE164,
    );
  }

  private refreshPairing(): void {
    if (!this.selectedSessionId) return;
    this.api.sessionQr(this.selectedSessionId).subscribe((result) => {
      this.selectedQr.set(result.qrDataUrl);
      this.selectedPairingCode.set(result.pairingCode);
      this.selectedStatus.set(result.status);
      this.selectedError.set(result.lastConnectionError || "");
      this.selectedErrorCode.set(result.lastConnectionCode);
      this.load();
      if (["CONNECTED", "PAIRING_FAILED", "LOGGED_OUT", "QUARANTINED", "DELETED"].includes(result.status)) {
        if (this.pairingTimer) clearInterval(this.pairingTimer);
        this.pairingTimer = undefined;
      }
    });
  }

  private clearSelection(): void {
    this.selectedSessionId = undefined;
    this.selectedQr.set(null);
    this.selectedPairingCode.set(null);
    this.selectedStatus.set("");
    this.selectedError.set("");
    if (this.pairingTimer) clearInterval(this.pairingTimer);
    this.pairingTimer = undefined;
  }
}
