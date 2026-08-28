import { Component, OnInit, inject, signal, computed } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { ButtonModule } from "primeng/button";
import { CardModule } from "primeng/card";
import { InputTextModule } from "primeng/inputtext";
import { MessageService } from "primeng/api";
import {
  ApiService,
  type CampaignContactValidationResult,
  type MediaRecord,
  type SessionRecord,
  type Voto1x10ContactosResult,
  type Voto1x10Jerarquia,
  type Voto1x10Usuario,
} from "../core/api.service";

/**
 * Versión de "Campañas" enfocada en jalar destinatarios directo del padrón
 * 1x10 por combos jerárquicos (Territorio / Administrador / Gerente /
 * Movilizador) en vez de cargarlos a mano o por archivo. La creación real
 * de la campaña reutiliza el mismo backend que la pantalla "Campañas"
 * (misma cola, mismo algoritmo de reparto); para pausar/cancelar/ver
 * detalle de una campaña ya creada, se gestiona desde ahí.
 */
@Component({
  standalone: true,
  imports: [FormsModule, ButtonModule, CardModule, InputTextModule],
  template: `
    <main class="page">
      <div class="page-header">
        <div>
          <h1>Envíos por jerarquía 1x10</h1>
          <div class="muted">Elegí territorios, administradores, gerentes y/o movilizadores: se junta a toda su gente (sin duplicados) como destinatarios.</div>
        </div>
      </div>

      <div class="grid two top-grid">
        <p-card header="1. Elegí a quién">
          @if (loadingJerarquia()) {
            <div class="muted">Cargando estructura del padrón…</div>
          } @else if (!jerarquia()) {
            <div class="error">No se pudo cargar la estructura de 1x10. Reintentá más tarde.</div>
          } @else {
            <div class="hierarchy-columns">
              <div class="hierarchy-col">
                <strong>Territorio ({{ jerarquia()!.territorios.length }})</strong>
                <div class="option-list">
                  @for (item of jerarquia()!.territorios; track item.idTerritorio) {
                    <label class="check-row">
                      <input type="checkbox" [checked]="territorioIds().includes(item.idTerritorio)" (change)="toggle(territorioIds, item.idTerritorio)" />
                      {{ item.nombre }} <small>({{ item.tipoTerritorio }})</small>
                    </label>
                  } @empty {
                    <div class="muted small">Sin territorios.</div>
                  }
                </div>
              </div>

              <div class="hierarchy-col">
                <strong>Administrador ({{ jerarquia()!.administradores.length }})</strong>
                <div class="option-list">
                  @for (item of jerarquia()!.administradores; track item.idUsuario) {
                    <label class="check-row">
                      <input type="checkbox" [checked]="administradorIds().includes(item.idUsuario)" (change)="toggle(administradorIds, item.idUsuario)" />
                      {{ item.nombreCompleto }} <small>{{ item.territorio || '' }}</small>
                    </label>
                  } @empty {
                    <div class="muted small">Sin administradores.</div>
                  }
                </div>
              </div>

              <div class="hierarchy-col">
                <strong>Gerente ({{ gerentesVisibles().length }})</strong>
                <div class="option-list">
                  @for (item of gerentesVisibles(); track item.idUsuario) {
                    <label class="check-row">
                      <input type="checkbox" [checked]="gerenteIds().includes(item.idUsuario)" (change)="toggle(gerenteIds, item.idUsuario)" />
                      {{ item.nombreCompleto }}
                    </label>
                  } @empty {
                    <div class="muted small">Sin gerentes.</div>
                  }
                </div>
              </div>

              <div class="hierarchy-col">
                <strong>Movilizador ({{ movilizadoresVisibles().length }})</strong>
                <input pInputText class="mov-search" placeholder="Buscar movilizador..." [(ngModel)]="filtroMovilizador" name="filtroMovilizador" />
                <div class="option-list">
                  @for (item of movilizadoresVisibles(); track item.idUsuario) {
                    <label class="check-row">
                      <input type="checkbox" [checked]="movilizadorIds().includes(item.idUsuario)" (change)="toggle(movilizadorIds, item.idUsuario)" />
                      {{ item.nombreCompleto }} <small>({{ item.totalPersonas }} personas)</small>
                    </label>
                  } @empty {
                    <div class="muted small">Sin movilizadores.</div>
                  }
                </div>
              </div>
            </div>

            <div class="actions selection-actions">
              <span class="muted">{{ totalSeleccionados() }} elegido(s) en total</span>
              <p-button type="button" label="Limpiar selección" severity="secondary" size="small" [disabled]="totalSeleccionados() === 0" (onClick)="limpiarSeleccion()" />
              <p-button type="button" label="Cargar personas" icon="pi pi-users" [loading]="loadingContactos()" [disabled]="totalSeleccionados() === 0" (onClick)="cargarPersonas()" />
            </div>
          }

          @if (contactosResult(); as resultado) {
            <div class="contactos-summary">
              <div><strong>{{ resultado.movilizadorCount }}</strong><span>movilizador(es)</span></div>
              <div><strong>{{ resultado.personaCount }}</strong><span>personas encontradas</span></div>
              <div><strong>{{ resultado.contacts.length }}</strong><span>con celular único</span></div>
            </div>
            @if (resultado.contacts.length === 0) {
              <div class="muted">Ninguno de los seleccionados tiene personas con celular cargado.</div>
            }
          }
        </p-card>

        <p-card header="2. Mensaje y envío">
          <form class="form-grid" (ngSubmit)="crearCampania()">
            <label for="cj-name">Nombre de la campaña</label>
            <input pInputText id="cj-name" name="cjName" [(ngModel)]="name" />

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

            <label for="cj-message">Mensaje</label>
            <textarea id="cj-message" name="cjMessage" rows="5" [(ngModel)]="messageText" [placeholder]="'Hola {{nombre}}, ...'"></textarea>
            <div class="contact-help">Variable disponible: {{ '{{nombre}}' }}.</div>

            <label for="cj-media">Multimedia (opcional)</label>
            <select id="cj-media" name="cjMedia" [(ngModel)]="selectedMediaAssetId">
              <option value="">Sin multimedia</option>
              @for (item of mediaItems(); track item.id) {
                <option [value]="item.id">{{ item.fileName }}</option>
              }
            </select>

            <label for="cj-region">País / región por defecto</label>
            <select id="cj-region" name="cjRegion" [(ngModel)]="defaultRegion" (ngModelChange)="validationResult.set(null)">
              @for (region of regionOptions; track region.code) {
                <option [value]="region.code">{{ region.label }}</option>
              }
            </select>

            <p-button type="button" label="Validar destinatarios" icon="pi pi-check-circle" severity="secondary" [loading]="validating()" [disabled]="!contactosResult()?.contacts?.length" (onClick)="validar()" />

            @if (validationResult(); as validacion) {
              <div class="validation-summary">
                <div><strong>{{ validacion.valid }}</strong><span>válidos</span></div>
                <div><strong>{{ validacion.duplicates }}</strong><span>duplicados</span></div>
                <div><strong>{{ validacion.invalid }}</strong><span>inválidos</span></div>
                <div><strong>{{ validacion.sendable }}</strong><span>a enviar</span></div>
              </div>
            }

            <label class="check-row">
              <input type="checkbox" [(ngModel)]="consentConfirmed" name="cjConsent" />
              Confirmo que estas personas dieron su consentimiento / son parte del padrón autorizado de la campaña.
            </label>

            <p-button type="submit" label="Crear campaña" icon="pi pi-send" [loading]="saving()" [disabled]="saving()" />
          </form>

          @if (ultimaCampaniaCreada(); as campania) {
            <div class="created-box">
              <div><i class="pi pi-check-circle"></i> Campaña <strong>{{ campania.name }}</strong> creada en borrador con {{ campania.totalMessages }} destinatario(s).</div>
              <p-button type="button" label="Iniciar ahora" icon="pi pi-play" severity="success" size="small" [loading]="starting()" (onClick)="iniciarCampania(campania.id)" />
              <span class="muted small">O gestionala luego desde "Campañas".</span>
            </div>
          }
        </p-card>
      </div>
    </main>
  `,
  styles: [`
    .top-grid{align-items:start}
    .hierarchy-columns{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.75rem}
    .hierarchy-col{display:flex;flex-direction:column;gap:.4rem;min-width:0}
    .hierarchy-col strong{font-size:.85rem}
    .option-list{display:flex;flex-direction:column;gap:.3rem;max-height:220px;overflow:auto;border:1px solid #e2e8f0;border-radius:8px;padding:.5rem;background:#f8fafc}
    .check-row{display:flex;align-items:center;gap:.4rem;font-size:.82rem;font-weight:400}
    .small{font-size:.75rem}
    .mov-search{margin-bottom:.1rem}
    .selection-actions{margin-top:.9rem;flex-wrap:wrap}
    .contactos-summary{display:grid;grid-template-columns:repeat(3,minmax(100px,1fr));gap:.5rem;margin-top:.9rem}
    .contactos-summary>div{display:grid;gap:.1rem;border:1px solid #e2e8f0;border-radius:9px;padding:.6rem;background:#f8fafc;text-align:center}
    .contactos-summary span{font-size:.72rem;color:#64748b}
    .contactos-summary strong{font-size:1.15rem}
    .validation-summary{display:grid;grid-template-columns:repeat(4,minmax(70px,1fr));gap:.4rem}
    .validation-summary>div{display:grid;gap:.1rem;border:1px solid #e2e8f0;border-radius:8px;padding:.5rem;background:#f8fafc;text-align:center}
    .validation-summary span{font-size:.7rem;color:#64748b}
    .validation-summary strong{font-size:1rem}
    .created-box{margin-top:1rem;display:flex;align-items:center;gap:.7rem;flex-wrap:wrap;border:1px solid #bbf7d0;background:#f0fdf4;border-radius:10px;padding:.7rem .9rem;font-size:.85rem}
    .created-box i{color:#16a34a}
    @media(max-width:1100px){.hierarchy-columns{grid-template-columns:repeat(2,1fr)}}
    @media(max-width:1000px){.top-grid{grid-template-columns:1fr}}
    @media(max-width:640px){.hierarchy-columns{grid-template-columns:1fr}}
  `],
})
export class CampaignsJerarquicoComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly messages = inject(MessageService);

  readonly jerarquia = signal<Voto1x10Jerarquia | null>(null);
  readonly loadingJerarquia = signal(true);

  readonly territorioIds = signal<number[]>([]);
  readonly administradorIds = signal<number[]>([]);
  readonly gerenteIds = signal<number[]>([]);
  readonly movilizadorIds = signal<number[]>([]);
  filtroMovilizador = "";

  readonly totalSeleccionados = computed(() =>
    this.territorioIds().length + this.administradorIds().length + this.gerenteIds().length + this.movilizadorIds().length);

  readonly gerentesVisibles = computed<Voto1x10Usuario[]>(() => {
    const data = this.jerarquia();
    if (!data) return [];
    const admins = this.administradorIds();
    if (admins.length === 0) return data.gerentes;
    return data.gerentes.filter((g) => g.idUsuarioSupervisor !== undefined && admins.includes(g.idUsuarioSupervisor));
  });

  readonly movilizadoresVisibles = computed<Voto1x10Usuario[]>(() => {
    const data = this.jerarquia();
    if (!data) return [];
    const gerentes = this.gerenteIds();
    const territorios = this.territorioIds();
    let base = data.movilizadores;
    if (gerentes.length > 0 || territorios.length > 0) {
      base = base.filter((m) =>
        (m.idUsuarioSupervisor !== undefined && gerentes.includes(m.idUsuarioSupervisor)) ||
        (m.idTerritorio !== undefined && territorios.includes(m.idTerritorio)));
    }
    const texto = this.filtroMovilizador.trim().toLowerCase();
    if (!texto) return base;
    return base.filter((m) => m.nombreCompleto.toLowerCase().includes(texto));
  });

  readonly loadingContactos = signal(false);
  readonly contactosResult = signal<Voto1x10ContactosResult | null>(null);

  readonly sessions = signal<SessionRecord[]>([]);
  readonly connectedSessions = signal<SessionRecord[]>([]);
  readonly selectedSessionIds = signal<string[]>([]);
  readonly mediaItems = signal<MediaRecord[]>([]);
  readonly selectedMediaAssetId = signal("");

  readonly validating = signal(false);
  readonly validationResult = signal<CampaignContactValidationResult | null>(null);
  readonly saving = signal(false);
  readonly starting = signal(false);
  readonly ultimaCampaniaCreada = signal<{ id: string; name: string; totalMessages: number } | null>(null);

  name = "";
  messageText = "";
  consentConfirmed = false;
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

  ngOnInit(): void {
    this.loadJerarquia();
    this.api.sessions().subscribe((items) => {
      this.sessions.set(items);
      this.connectedSessions.set(items.filter((item) => item.status === "CONNECTED"));
    });
    this.api.media().subscribe({ next: (items) => this.mediaItems.set(items), error: () => this.mediaItems.set([]) });
  }

  loadJerarquia(): void {
    this.loadingJerarquia.set(true);
    this.api.voto1x10Jerarquia().subscribe({
      next: (data) => { this.jerarquia.set(data); this.loadingJerarquia.set(false); },
      error: (error: { error?: { message?: string } }) => {
        this.loadingJerarquia.set(false);
        this.messages.add({ severity: "error", summary: "No se pudo cargar la estructura de 1x10", detail: error.error?.message });
      },
    });
  }

  toggle(signalRef: ReturnType<typeof signal<number[]>>, id: number): void {
    const current = signalRef();
    signalRef.set(current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
    this.contactosResult.set(null);
    this.validationResult.set(null);
  }

  toggleSession(id: string): void {
    const current = this.selectedSessionIds();
    this.selectedSessionIds.set(current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  limpiarSeleccion(): void {
    this.territorioIds.set([]);
    this.administradorIds.set([]);
    this.gerenteIds.set([]);
    this.movilizadorIds.set([]);
    this.contactosResult.set(null);
    this.validationResult.set(null);
  }

  cargarPersonas(): void {
    this.loadingContactos.set(true);
    this.api.voto1x10Contactos({
      territorioIds: this.territorioIds(),
      administradorIds: this.administradorIds(),
      gerenteIds: this.gerenteIds(),
      movilizadorIds: this.movilizadorIds(),
    }).subscribe({
      next: (resultado) => {
        this.loadingContactos.set(false);
        this.contactosResult.set(resultado);
        this.validationResult.set(null);
      },
      error: (error: { error?: { message?: string } }) => {
        this.loadingContactos.set(false);
        this.messages.add({ severity: "error", summary: "No se pudo cargar personas", detail: error.error?.message });
      },
    });
  }

  validar(): void {
    const contacts = this.contactosResult()?.contacts ?? [];
    if (contacts.length === 0) return;
    this.validating.set(true);
    this.api.validateCampaignContacts({ contacts, defaultRegion: this.defaultRegion.toUpperCase() }).subscribe({
      next: (result) => { this.validating.set(false); this.validationResult.set(result); },
      error: (error: { error?: { message?: string } }) => {
        this.validating.set(false);
        this.messages.add({ severity: "error", summary: "No se pudo validar", detail: error.error?.message });
      },
    });
  }

  crearCampania(): void {
    if (!this.name.trim()) {
      this.messages.add({ severity: "warn", summary: "Ingresa un nombre para la campaña" });
      return;
    }
    if (this.selectedSessionIds().length === 0) {
      this.messages.add({ severity: "warn", summary: "Selecciona al menos una sesión emisora" });
      return;
    }
    const contacts = this.contactosResult()?.contacts ?? [];
    if (contacts.length === 0) {
      this.messages.add({ severity: "warn", summary: "Cargá personas antes de crear la campaña" });
      return;
    }
    if (!this.messageText.trim() && !this.selectedMediaAssetId()) {
      this.messages.add({ severity: "warn", summary: "Agrega un mensaje o multimedia" });
      return;
    }
    if (!this.consentConfirmed) {
      this.messages.add({ severity: "warn", summary: "Confirma la autorización de los destinatarios." });
      return;
    }

    this.saving.set(true);
    this.api.createCampaign({
      name: this.name.trim(),
      sessionIds: this.selectedSessionIds(),
      contacts,
      message: { text: this.messageText },
      mediaAssetId: this.selectedMediaAssetId() || undefined,
      defaultRegion: this.defaultRegion.toUpperCase(),
    }).subscribe({
      next: (created) => {
        this.saving.set(false);
        this.ultimaCampaniaCreada.set({ id: created.id, name: created.name, totalMessages: created.totalMessages });
        this.messages.add({ severity: "success", summary: "Campaña creada en borrador" });
      },
      error: (error: { error?: { message?: string } }) => {
        this.saving.set(false);
        this.messages.add({ severity: "error", summary: "No se pudo crear la campaña", detail: error.error?.message });
      },
    });
  }

  iniciarCampania(id: string): void {
    this.starting.set(true);
    this.api.startCampaign(id).subscribe({
      next: () => {
        this.starting.set(false);
        this.messages.add({ severity: "success", summary: "Campaña iniciada" });
        this.ultimaCampaniaCreada.set(null);
        this.resetForm();
      },
      error: (error: { error?: { message?: string } }) => {
        this.starting.set(false);
        this.messages.add({ severity: "error", summary: "No se pudo iniciar", detail: error.error?.message });
      },
    });
  }

  private resetForm(): void {
    this.name = "";
    this.messageText = "";
    this.consentConfirmed = false;
    this.selectedMediaAssetId.set("");
    this.selectedSessionIds.set([]);
    this.limpiarSeleccion();
  }
}
