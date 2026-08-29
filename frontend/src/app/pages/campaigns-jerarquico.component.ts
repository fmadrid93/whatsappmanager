import { Component, OnInit, inject, signal, computed } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { ButtonModule } from "primeng/button";
import { CardModule } from "primeng/card";
import { InputTextModule } from "primeng/inputtext";
import { MultiSelectModule } from "primeng/multiselect";
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
  imports: [FormsModule, ButtonModule, CardModule, InputTextModule, MultiSelectModule],
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
            <div class="hierarchy-filters">
              <div class="filter-field">
                <label>Territorio <span class="muted small">({{ jerarquia()!.territorios.length }})</span></label>
                <p-multiSelect
                  [options]="territorioOptions()"
                  optionLabel="label"
                  optionValue="id"
                  [ngModel]="territorioIds()"
                  (ngModelChange)="onSelectionChange('territorio', $event)"
                  filter="true"
                  filterPlaceHolder="Buscar territorio..."
                  display="chip"
                  [maxSelectedLabels]="2"
                  selectedItemsLabel="{0} territorios elegidos"
                  placeholder="Todos (sin filtrar)"
                  [showClear]="true"
                  styleClass="w-full"
                />
              </div>

              <div class="filter-field">
                <label>Administrador <span class="muted small">({{ jerarquia()!.administradores.length }})</span></label>
                <p-multiSelect
                  [options]="administradorOptions()"
                  optionLabel="label"
                  optionValue="id"
                  [ngModel]="administradorIds()"
                  (ngModelChange)="onSelectionChange('administrador', $event)"
                  filter="true"
                  filterPlaceHolder="Buscar administrador..."
                  display="chip"
                  [maxSelectedLabels]="2"
                  selectedItemsLabel="{0} administradores elegidos"
                  placeholder="Todos (sin filtrar)"
                  [showClear]="true"
                  styleClass="w-full"
                />
              </div>

              <div class="filter-field">
                <label>
                  Gerente <span class="muted small">({{ gerenteOptions().length }}{{ administradorIds().length ? ' de sus administradores' : '' }})</span>
                </label>
                <p-multiSelect
                  [options]="gerenteOptions()"
                  optionLabel="label"
                  optionValue="id"
                  [ngModel]="gerenteIds()"
                  (ngModelChange)="onSelectionChange('gerente', $event)"
                  filter="true"
                  filterPlaceHolder="Buscar gerente..."
                  display="chip"
                  [maxSelectedLabels]="2"
                  selectedItemsLabel="{0} gerentes elegidos"
                  placeholder="Todos (sin filtrar)"
                  [showClear]="true"
                  styleClass="w-full"
                />
              </div>

              <div class="filter-field">
                <label>
                  Movilizador <span class="muted small">({{ movilizadorOptions().length }}{{ (gerenteIds().length || territorioIds().length) ? ' de lo elegido arriba' : '' }})</span>
                </label>
                <p-multiSelect
                  [options]="movilizadorOptions()"
                  optionLabel="label"
                  optionValue="id"
                  [ngModel]="movilizadorIds()"
                  (ngModelChange)="onSelectionChange('movilizador', $event)"
                  filter="true"
                  filterPlaceHolder="Buscar movilizador..."
                  display="chip"
                  [maxSelectedLabels]="2"
                  selectedItemsLabel="{0} movilizadores elegidos"
                  placeholder="Todos (sin filtrar)"
                  [showClear]="true"
                  styleClass="w-full"
                />
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

              @if (validacion.invalid > 0) {
                <div class="rejected-box">
                  <div class="rejected-header">
                    <i class="pi pi-exclamation-triangle"></i>
                    {{ validacion.invalid }} número(s) rechazado(s) — revisá si son de otro país que "{{ regionLabelActual() }}"
                  </div>
                  <div class="rejected-list">
                    @for (item of validacion.rejected; track item.sourceIndex) {
                      <div class="rejected-row">
                        <span class="rejected-phone">{{ item.phone }}</span>
                        <span class="rejected-name">{{ item.name || 'Sin nombre' }}</span>
                        <span class="rejected-reason">{{ item.reason }}</span>
                      </div>
                    }
                  </div>
                </div>
              }
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
    .hierarchy-filters{display:flex;flex-direction:column;gap:.9rem}
    .filter-field{display:flex;flex-direction:column;gap:.35rem}
    .filter-field label{font-size:.85rem;font-weight:600;color:#334155}
    .filter-field p-multiselect{display:block;width:100%}
    .check-row{display:flex;align-items:center;gap:.4rem;font-size:.82rem;font-weight:400}
    .small{font-size:.75rem}
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
    .rejected-box{border:1px solid #fecaca;background:#fef2f2;border-radius:10px;padding:.6rem .8rem;display:flex;flex-direction:column;gap:.4rem}
    .rejected-header{display:flex;align-items:center;gap:.4rem;font-size:.82rem;font-weight:600;color:#b91c1c}
    .rejected-list{max-height:220px;overflow-y:auto;display:flex;flex-direction:column;gap:.3rem}
    .rejected-row{display:grid;grid-template-columns:minmax(90px,auto) minmax(90px,1fr) minmax(120px,1fr);gap:.5rem;font-size:.78rem;border-bottom:1px dashed #fecaca;padding-bottom:.3rem}
    .rejected-phone{font-weight:600;color:#991b1b}
    .rejected-name{color:#7f1d1d}
    .rejected-reason{color:#b45309}
    @media(max-width:640px){.rejected-row{grid-template-columns:1fr}}
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

  readonly totalSeleccionados = computed(() =>
    this.territorioIds().length + this.administradorIds().length + this.gerenteIds().length + this.movilizadorIds().length);

  readonly territorioOptions = computed<{ id: number; label: string }[]>(() =>
    (this.jerarquia()?.territorios ?? []).map((t) => ({
      id: t.idTerritorio,
      label: `${t.nombre} (${t.tipoTerritorio})`,
    })));

  private readonly administradoresVisibles = computed<Voto1x10Usuario[]>(() => {
    const data = this.jerarquia();
    if (!data) return [];
    const territorios = this.territorioIds();
    if (territorios.length === 0) return data.administradores;
    return data.administradores.filter((a) => a.idTerritorio !== undefined && territorios.includes(a.idTerritorio));
  });

  readonly administradorOptions = computed<{ id: number; label: string }[]>(() =>
    this.administradoresVisibles().map((a) => ({
      id: a.idUsuario,
      label: a.territorio ? `${a.nombreCompleto} — ${a.territorio}` : a.nombreCompleto,
    })));

  private readonly gerentesVisibles = computed<Voto1x10Usuario[]>(() => {
    const data = this.jerarquia();
    if (!data) return [];
    const admins = this.administradorIds();
    if (admins.length === 0) return data.gerentes;
    return data.gerentes.filter((g) => g.idUsuarioSupervisor !== undefined && admins.includes(g.idUsuarioSupervisor));
  });

  readonly gerenteOptions = computed<{ id: number; label: string }[]>(() =>
    this.gerentesVisibles().map((g) => ({ id: g.idUsuario, label: g.nombreCompleto })));

  private readonly movilizadoresVisibles = computed<Voto1x10Usuario[]>(() => {
    const data = this.jerarquia();
    if (!data) return [];
    const gerentes = this.gerenteIds();
    const territorios = this.territorioIds();
    if (gerentes.length === 0 && territorios.length === 0) return data.movilizadores;
    return data.movilizadores.filter((m) =>
      (m.idUsuarioSupervisor !== undefined && gerentes.includes(m.idUsuarioSupervisor)) ||
      (m.idTerritorio !== undefined && territorios.includes(m.idTerritorio)));
  });

  readonly movilizadorOptions = computed<{ id: number; label: string }[]>(() =>
    this.movilizadoresVisibles().map((m) => ({ id: m.idUsuario, label: `${m.nombreCompleto} (${m.totalPersonas} personas)` })));

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
    { code: "PY", label: "Paraguay (+595)" },
    { code: "BO", label: "Bolivia (+591)" },
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
  defaultRegion = "PY";

  regionLabelActual(): string {
    return this.regionOptions.find((r) => r.code === this.defaultRegion)?.label ?? this.defaultRegion;
  }

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

  onSelectionChange(nivel: "territorio" | "administrador" | "gerente" | "movilizador", ids: number[]): void {
    const valores = ids ?? [];
    if (nivel === "territorio") this.territorioIds.set(valores);
    else if (nivel === "administrador") this.administradorIds.set(valores);
    else if (nivel === "gerente") this.gerenteIds.set(valores);
    else this.movilizadorIds.set(valores);

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
