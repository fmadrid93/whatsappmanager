import { Component, OnInit, inject, signal, computed } from "@angular/core";
import { DatePipe } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ButtonModule } from "primeng/button";
import { CardModule } from "primeng/card";
import { InputTextModule } from "primeng/inputtext";
import { MultiSelectModule } from "primeng/multiselect";
import { MessageService } from "primeng/api";
import {
  ApiService,
  type CampaignContactValidationResult,
  type CampaignRecord,
  type MediaRecord,
  type RecurringCampaignRecord,
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
  imports: [FormsModule, DatePipe, ButtonModule, CardModule, InputTextModule, MultiSelectModule],
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
            <div class="session-toolbar">
              <div class="session-toggle">
                <button type="button" class="tab-btn" [class.active]="!mostrarTodasLasSesiones()" (click)="mostrarTodasLasSesiones.set(false)">
                  De los elegidos arriba@if (haySeleccionJerarquica()) { ({{ sesionesDeElegidosCount() }}) }
                </button>
                <button type="button" class="tab-btn" [class.active]="mostrarTodasLasSesiones()" (click)="mostrarTodasLasSesiones.set(true)">
                  Todas ({{ sessions().length }})
                </button>
              </div>
              <select class="estado-select" [ngModel]="filtroEstadoSesion()" (ngModelChange)="filtroEstadoSesion.set($event)" name="cjFiltroEstadoSesion" [ngModelOptions]="{ standalone: true }">
                <option value="">Todos los estados</option>
                @for (estado of estadosDisponibles(); track estado) {
                  <option [value]="estado">{{ sessionStatusLabel(estado) }}</option>
                }
              </select>
            </div>
            @if (!mostrarTodasLasSesiones() && haySeleccionJerarquica() && sesionesDeElegidosCount() === 0) {
              <div class="muted small">Ninguno de los elegidos arriba tiene una sesión de WhatsApp propia todavía.</div>
            }
            <div class="session-options">
              @for (session of sesionesDeSeleccionados(); track session.id) {
                <label class="check-row">
                  <input type="checkbox" [checked]="selectedSessionIds().includes(session.id)" (change)="toggleSession(session.id)" />
                  {{ session.name }} — {{ session.phoneE164 || sessionStatusLabel(session.status) }}
                </label>
              } @empty {
                <div class="muted">No hay sesiones para este filtro.</div>
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

              <div class="lista-numeros">
                <div class="lista-toolbar">
                  <div class="lista-tabs">
                    <button type="button" class="tab-btn" [class.active]="listaTab() === 'validos'" (click)="listaTab.set('validos')">Válidos ({{ validacion.valid }})</button>
                    <button type="button" class="tab-btn" [class.active]="listaTab() === 'invalidos'" (click)="listaTab.set('invalidos')">Inválidos ({{ validacion.invalid }})</button>
                    <button type="button" class="tab-btn" [class.active]="listaTab() === 'duplicados'" (click)="listaTab.set('duplicados')">Duplicados ({{ validacion.duplicates }})</button>
                  </div>
                  <input pInputText type="text" class="filtro-input" placeholder="Filtrar por nombre o número..." [(ngModel)]="filtroNumeros" name="filtroNumeros" [ngModelOptions]="{ standalone: true }" />
                </div>

                @if (listaTab() === 'invalidos' && validacion.invalid > 0) {
                  <div class="lista-hint"><i class="pi pi-exclamation-triangle"></i> Revisá si son de otro país que "{{ regionLabelActual() }}".</div>
                }

                @if (listaTab() === 'validos') {
                  <div class="numeros-list">
                    @for (item of validosFiltrados(validacion); track item.sourceIndex) {
                      <div class="numero-row ok">
                        <span class="numero-e164">{{ item.e164 }}</span>
                        <span class="numero-raw">{{ item.raw }}</span>
                        <span class="numero-name">{{ item.name || 'Sin nombre' }}</span>
                      </div>
                    } @empty {
                      <div class="muted small">Sin resultados para ese filtro.</div>
                    }
                  </div>
                }

                @if (listaTab() === 'invalidos') {
                  <div class="numeros-list">
                    @for (item of invalidosFiltrados(validacion); track item.sourceIndex) {
                      <div class="numero-row bad">
                        <span class="numero-e164">{{ item.phone }}</span>
                        <span class="numero-name">{{ item.name || 'Sin nombre' }}</span>
                        <span class="numero-reason">{{ item.reason }}</span>
                      </div>
                    } @empty {
                      <div class="muted small">Sin resultados para ese filtro.</div>
                    }
                  </div>
                }

                @if (listaTab() === 'duplicados') {
                  <div class="numeros-list">
                    @for (item of duplicadosFiltrados(validacion); track item.sourceIndex) {
                      <div class="numero-row dup">
                        <span class="numero-e164">{{ item.e164 }}</span>
                        <span class="numero-raw">{{ item.phone }}</span>
                        <span class="numero-name">{{ item.name || 'Sin nombre' }}</span>
                      </div>
                    } @empty {
                      <div class="muted small">Sin resultados para ese filtro.</div>
                    }
                  </div>
                }
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

      <p-card header="3. Repetir automáticamente (opcional)" styleClass="recurring-card">
        <div class="muted">
          Guarda la misma selección de arriba (territorio/administrador/gerente/movilizador) y el mismo mensaje para que se repita solo: cada cierto tiempo busca gente nueva que todavía no fue contactada por ningún envío y le manda el mensaje, sin que tengas que volver a esta pantalla.
        </div>

        <div class="form-grid recurring-form">
          <label for="cj-rec-interval">Repetir cada</label>
          <select id="cj-rec-interval" name="cjRecInterval" [(ngModel)]="recurringIntervalMinutes" [ngModelOptions]="{ standalone: true }">
            @for (preset of intervalPresets; track preset.minutes) {
              <option [value]="preset.minutes">{{ preset.label }}</option>
            }
          </select>

          <p-button
            type="button"
            label="Guardar como recurrente"
            icon="pi pi-refresh"
            severity="help"
            [loading]="savingRecurring()"
            [disabled]="totalSeleccionados() === 0 || !name.trim() || selectedSessionIds().length === 0"
            (onClick)="crearRecurrente()"
          />
          <div class="contact-help">
            Usa el nombre, sesiones, mensaje, multimedia y región configurados en la columna "Mensaje y envío" de arriba, más la selección de territorio/administrador/gerente/movilizador elegida en "1. Elegí a quién".
          </div>
        </div>

        @if (recurrentesJerarquia().length > 0) {
          <div class="recurring-table-wrap">
            <table class="recurring-table">
              <thead>
                <tr><th>Nombre</th><th>Repite</th><th>Estado</th><th>Última corrida</th><th>Resultado</th><th></th></tr>
              </thead>
              <tbody>
                @for (item of recurrentesJerarquia(); track item.id) {
                  <tr>
                    <td>{{ item.name }}</td>
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
                        <p-button type="button" icon="pi pi-pause" severity="secondary" size="small" [loading]="busyRecurringIds().has(item.id)" (onClick)="pausarRecurrente(item)" title="Pausar" />
                      } @else {
                        <p-button type="button" icon="pi pi-play" severity="success" size="small" [loading]="busyRecurringIds().has(item.id)" (onClick)="reanudarRecurrente(item)" title="Reanudar" />
                      }
                      <p-button type="button" icon="pi pi-trash" severity="danger" size="small" [loading]="busyRecurringIds().has(item.id)" (onClick)="eliminarRecurrente(item)" title="Eliminar" />
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        } @else {
          <div class="muted" style="margin-top:.8rem">Todavía no configuraste ningún envío recurrente por jerarquía.</div>
        }
      </p-card>

      <p-card header="4. Campañas registradas" styleClass="recurring-card">
        @if (loadingCampanias()) {
          <div class="muted">Cargando campañas...</div>
        } @else if (campanias().length === 0) {
          <div class="muted">Todavía no creaste ninguna campaña.</div>
        } @else {
          <div class="recurring-table-wrap">
            <table class="recurring-table">
              <thead>
                <tr><th>Nombre</th><th>Jerarquía</th><th>Estado</th><th>Destinatarios</th><th>Enviados</th><th>Fallidos</th><th>Creada</th></tr>
              </thead>
              <tbody>
                @for (campania of campanias(); track campania.id) {
                  <tr>
                    <td>{{ campania.name }}</td>
                    <td>
                      @if (campania.jerarquiaResumen) {
                        <span class="jerarquia-tag">{{ campania.jerarquiaResumen }}</span>
                      } @else {
                        <span class="muted small">—</span>
                      }
                    </td>
                    <td><span class="status-pill" [class.paused]="campania.status === 'PAUSED'">{{ campaignStatusLabel(campania.status) }}</span></td>
                    <td>{{ campania.totalMessages }}</td>
                    <td>{{ campania.sentMessages }}</td>
                    <td>{{ campania.failedMessages }}</td>
                    <td>{{ campania.createdAt | date:'short' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <div class="contact-help" style="margin-top:.6rem">Para pausar, cancelar o ver el detalle completo de una campaña, andá a la pantalla "Campañas".</div>
        }
      </p-card>
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
    .lista-numeros{border:1px solid #e2e8f0;border-radius:10px;padding:.6rem .7rem;display:flex;flex-direction:column;gap:.5rem;background:#fff}
    .lista-toolbar{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:.5rem}
    .lista-tabs{display:flex;gap:.35rem;flex-wrap:wrap}
    .tab-btn{border:1px solid #e2e8f0;background:#f8fafc;border-radius:999px;padding:.3rem .7rem;font-size:.75rem;font-weight:600;color:#475569;cursor:pointer}
    .tab-btn.active{background:#0f172a;border-color:#0f172a;color:#fff}
    .session-toolbar{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:.5rem;margin-bottom:.4rem}
    .session-toggle{display:flex;gap:.35rem;flex-wrap:wrap}
    .estado-select{border:1px solid #cfd8e3;border-radius:9px;padding:.4rem .6rem;font-size:.78rem;background:#fff;min-width:150px}
    .filtro-input{flex:1;min-width:180px;max-width:280px}
    .lista-hint{display:flex;align-items:center;gap:.4rem;font-size:.78rem;color:#b45309}
    .numeros-list{max-height:240px;overflow-y:auto;display:flex;flex-direction:column;gap:.25rem}
    .numero-row{display:grid;grid-template-columns:minmax(110px,auto) minmax(90px,1fr) minmax(110px,1fr);gap:.5rem;font-size:.78rem;border-bottom:1px dashed #e2e8f0;padding-bottom:.28rem;align-items:baseline}
    .numero-row.ok .numero-e164{color:#15803d;font-weight:600}
    .numero-row.bad .numero-e164{color:#991b1b;font-weight:600}
    .numero-row.dup .numero-e164{color:#b45309;font-weight:600}
    .numero-raw{color:#64748b}
    .numero-name{color:#334155}
    .numero-reason{color:#b45309}
    @media(max-width:640px){.numero-row{grid-template-columns:1fr}}
    @media(max-width:1100px){.hierarchy-columns{grid-template-columns:repeat(2,1fr)}}
    @media(max-width:1000px){.top-grid{grid-template-columns:1fr}}
    @media(max-width:640px){.hierarchy-columns{grid-template-columns:1fr}}
    .recurring-card{margin-top:1rem}
    .recurring-form{grid-template-columns:auto auto 1fr;align-items:center;gap:.6rem .9rem}
    .recurring-form select{max-width:220px}
    .recurring-form .contact-help{grid-column:1/-1}
    .jerarquia-tag{display:inline-block;background:#eef2ff;color:#3730a3;border-radius:7px;padding:.2rem .5rem;font-size:.72rem;font-weight:600;max-width:260px;white-space:normal}
    .recurring-table-wrap{overflow-x:auto;margin-top:1rem}
    .recurring-table{width:100%;border-collapse:collapse;font-size:.85rem}
    .recurring-table th{text-align:left;color:#64748b;font-size:.72rem;text-transform:uppercase;letter-spacing:.03em;padding:.4rem .6rem;border-bottom:1px solid #e2e8f0}
    .recurring-table td{padding:.55rem .6rem;border-bottom:1px solid #f1f5f9;vertical-align:middle}
    .recurring-table td.actions{display:flex;gap:.4rem}
    .status-pill{background:#dcfce7;color:#166534;border-radius:999px;padding:.2rem .6rem;font-size:.72rem;font-weight:700}
    .status-pill.paused{background:#fef3c7;color:#92400e}
    .outcome{font-weight:700;font-size:.8rem}
    .outcome.created{color:#027a48}
    .outcome.empty{color:#64748b}
    .outcome.error{color:#b42318}
    @media(max-width:640px){.recurring-form{grid-template-columns:1fr}.recurring-form select{max-width:none}}
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

  /** Resumen legible de la jerarquía elegida en "1. Elegí a quién" (para dejar rastro en la campaña creada). */
  readonly resumenJerarquiaSeleccion = computed<string>(() => {
    const partes: string[] = [];
    const nombresElegidos = (opciones: { id: number; label: string }[], ids: number[]) =>
      opciones.filter((o) => ids.includes(o.id)).map((o) => o.label.split(" — ")[0].split(" (")[0]);

    const territorios = nombresElegidos(this.territorioOptions(), this.territorioIds());
    if (territorios.length) partes.push(`Territorio: ${territorios.join(", ")}`);
    const administradores = nombresElegidos(this.administradorOptions(), this.administradorIds());
    if (administradores.length) partes.push(`Administrador: ${administradores.join(", ")}`);
    const gerentes = nombresElegidos(this.gerenteOptions(), this.gerenteIds());
    if (gerentes.length) partes.push(`Gerente: ${gerentes.join(", ")}`);
    const movilizadores = nombresElegidos(this.movilizadorOptions(), this.movilizadorIds());
    if (movilizadores.length) partes.push(`Movilizador: ${movilizadores.join(", ")}`);

    const resumen = partes.join(" · ");
    return resumen.length > 500 ? `${resumen.slice(0, 497)}...` : resumen;
  });

  readonly loadingContactos = signal(false);
  readonly contactosResult = signal<Voto1x10ContactosResult | null>(null);

  readonly sessions = signal<SessionRecord[]>([]);
  readonly connectedSessions = signal<SessionRecord[]>([]);
  readonly selectedSessionIds = signal<string[]>([]);

  /** Control explícito del usuario: mostrar solo las sesiones de los elegidos arriba, o todas. Nada de fallback automático/silencioso. */
  readonly mostrarTodasLasSesiones = signal(false);
  /** Filtro por estado de sesión ('' = todos los estados). */
  readonly filtroEstadoSesion = signal("");

  /**
   * Sesiones de WhatsApp de las personas elegidas en "1. Elegí a quién"
   * (administrador/gerente/movilizador) — matchea por el login de esa
   * persona en el sistema 1x10 contenido en el nombre de la sesión (ej.
   * "capital_movil_fmadridmovilizador_a1" contiene "fmadridmovilizador"),
   * o por el patrón u{idUsuario}_principal que usa el sistema para sus
   * mensajes automáticos. Mira TODAS las sesiones (no solo conectadas) para
   * que el filtro por estado tenga sentido (ej. ver que la suya está
   * "conectando" todavía).
   */
  private readonly coincidenciasSesionesElegidos = computed<SessionRecord[]>(() => {
    const data = this.jerarquia();
    const todas = this.sessions();
    const idsElegidos = [...this.administradorIds(), ...this.gerenteIds(), ...this.movilizadorIds()];
    if (!data || idsElegidos.length === 0) return [];

    const personas = [...data.administradores, ...data.gerentes, ...data.movilizadores]
      .filter((p) => idsElegidos.includes(p.idUsuario));

    return todas.filter((session) => {
      const nombre = session.name.toLowerCase();
      return personas.some((p) => {
        if (nombre === `u${p.idUsuario}_principal`) return true;
        const login = p.usuario?.trim().toLowerCase();
        return !!login && login.length >= 3 && nombre.includes(login);
      });
    });
  });

  readonly haySeleccionJerarquica = computed(() =>
    this.administradorIds().length + this.gerenteIds().length + this.movilizadorIds().length > 0);

  readonly sesionesDeElegidosCount = computed(() => this.coincidenciasSesionesElegidos().length);

  /** Base antes del filtro de estado: de los elegidos, o todas (según el toggle / si no hay nadie elegido). */
  private readonly sesionesBase = computed<SessionRecord[]>(() =>
    this.mostrarTodasLasSesiones() || !this.haySeleccionJerarquica() ? this.sessions() : this.coincidenciasSesionesElegidos());

  /** Lista final que se muestra: la base, filtrada por estado si hay uno elegido. */
  readonly sesionesDeSeleccionados = computed<SessionRecord[]>(() => {
    const base = this.sesionesBase();
    const estado = this.filtroEstadoSesion();
    return estado ? base.filter((s) => s.status === estado) : base;
  });

  /** Estados presentes en la base actual, para armar el <select> de filtro sin mostrar opciones vacías. */
  readonly estadosDisponibles = computed<string[]>(() => [...new Set(this.sesionesBase().map((s) => s.status))]);

  readonly mediaItems = signal<MediaRecord[]>([]);
  readonly selectedMediaAssetId = signal("");

  readonly validating = signal(false);
  readonly validationResult = signal<CampaignContactValidationResult | null>(null);
  readonly listaTab = signal<"validos" | "invalidos" | "duplicados">("validos");
  filtroNumeros = "";
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

  readonly campanias = signal<CampaignRecord[]>([]);
  readonly loadingCampanias = signal(false);

  readonly recurrentesJerarquia = signal<RecurringCampaignRecord[]>([]);
  readonly savingRecurring = signal(false);
  readonly busyRecurringIds = signal<Set<string>>(new Set());
  recurringIntervalMinutes = 60;
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
    this.loadJerarquia();
    this.api.sessions().subscribe((items) => {
      this.sessions.set(items);
      this.connectedSessions.set(items.filter((item) => item.status === "CONNECTED"));
    });
    this.api.media().subscribe({ next: (items) => this.mediaItems.set(items), error: () => this.mediaItems.set([]) });
    this.loadRecurrentes();
    this.loadCampanias();
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
    this.filtroNumeros = "";
    this.listaTab.set("validos");
    this.api.validateCampaignContacts({ contacts, defaultRegion: this.defaultRegion.toUpperCase() }).subscribe({
      next: (result) => { this.validating.set(false); this.validationResult.set(result); },
      error: (error: { error?: { message?: string } }) => {
        this.validating.set(false);
        this.messages.add({ severity: "error", summary: "No se pudo validar", detail: error.error?.message });
      },
    });
  }

  private coincideFiltro(...campos: Array<string | undefined>): boolean {
    const query = this.filtroNumeros.trim().toLowerCase();
    if (!query) return true;
    return campos.some((campo) => (campo ?? "").toLowerCase().includes(query));
  }

  validosFiltrados(validacion: CampaignContactValidationResult): CampaignContactValidationResult["normalizedPreview"] {
    return validacion.normalizedPreview.filter((item) => this.coincideFiltro(item.name, item.raw, item.e164));
  }

  invalidosFiltrados(validacion: CampaignContactValidationResult): CampaignContactValidationResult["rejected"] {
    return validacion.rejected.filter((item) => this.coincideFiltro(item.name, item.phone, item.reason));
  }

  duplicadosFiltrados(validacion: CampaignContactValidationResult): CampaignContactValidationResult["duplicatePreview"] {
    return validacion.duplicatePreview.filter((item) => this.coincideFiltro(item.name, item.phone, item.e164));
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
      jerarquiaResumen: this.resumenJerarquiaSeleccion() || undefined,
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
        this.loadCampanias();
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
        this.loadCampanias();
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

  loadRecurrentes(): void {
    this.api.recurringCampaigns().subscribe({
      next: (items) => this.recurrentesJerarquia.set(items.filter((item) => item.sourceType === "JERARQUIA")),
      error: () => this.recurrentesJerarquia.set([]),
    });
  }

  loadCampanias(): void {
    this.loadingCampanias.set(true);
    this.api.campaigns().subscribe({
      next: (items) => {
        this.loadingCampanias.set(false);
        this.campanias.set([...items].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      },
      error: () => {
        this.loadingCampanias.set(false);
        this.campanias.set([]);
      },
    });
  }

  campaignStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      DRAFT: "BORRADOR",
      PREPARING: "PREPARANDO",
      RUNNING: "EN EJECUCIÓN",
      PAUSED: "PAUSADA",
      PAUSED_BY_CIRCUIT_BREAKER: "PAUSADA POR SEGURIDAD",
      COMPLETED: "COMPLETADA",
      COMPLETED_WITH_ERRORS: "COMPLETADA CON ERRORES",
      CANCELLED: "CANCELADA",
    };
    return labels[status] ?? status;
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

  crearRecurrente(): void {
    if (!this.name.trim()) {
      this.messages.add({ severity: "warn", summary: "Ingresa un nombre" });
      return;
    }
    if (this.selectedSessionIds().length === 0) {
      this.messages.add({ severity: "warn", summary: "Selecciona al menos una sesión emisora" });
      return;
    }
    if (this.totalSeleccionados() === 0) {
      this.messages.add({ severity: "warn", summary: "Elegí al menos un territorio, administrador, gerente o movilizador" });
      return;
    }
    if (!this.messageText.trim() && !this.selectedMediaAssetId()) {
      this.messages.add({ severity: "warn", summary: "Agrega un mensaje o multimedia" });
      return;
    }

    this.savingRecurring.set(true);
    this.api.createRecurringCampaign({
      name: this.name.trim(),
      sourceType: "JERARQUIA",
      jerarquiaSelection: {
        territorioIds: this.territorioIds(),
        administradorIds: this.administradorIds(),
        gerenteIds: this.gerenteIds(),
        movilizadorIds: this.movilizadorIds(),
      },
      sessionIds: this.selectedSessionIds(),
      message: { text: this.messageText },
      mediaAssetId: this.selectedMediaAssetId() || undefined,
      defaultRegion: this.defaultRegion.toUpperCase(),
      intervalMinutes: this.recurringIntervalMinutes,
    }).subscribe({
      next: () => {
        this.savingRecurring.set(false);
        this.messages.add({ severity: "success", summary: "Envío recurrente guardado" });
        this.loadRecurrentes();
      },
      error: (error: { error?: { message?: string } }) => {
        this.savingRecurring.set(false);
        this.messages.add({ severity: "error", summary: "No se pudo guardar el envío recurrente", detail: error.error?.message });
      },
    });
  }

  private setBusyRecurring(id: string, busy: boolean): void {
    const current = new Set(this.busyRecurringIds());
    if (busy) current.add(id); else current.delete(id);
    this.busyRecurringIds.set(current);
  }

  pausarRecurrente(item: RecurringCampaignRecord): void {
    this.setBusyRecurring(item.id, true);
    this.api.pauseRecurringCampaign(item.id).subscribe({
      next: () => { this.setBusyRecurring(item.id, false); this.loadRecurrentes(); },
      error: (error: { error?: { message?: string } }) => {
        this.setBusyRecurring(item.id, false);
        this.messages.add({ severity: "error", summary: "No se pudo pausar", detail: error.error?.message });
      },
    });
  }

  reanudarRecurrente(item: RecurringCampaignRecord): void {
    this.setBusyRecurring(item.id, true);
    this.api.resumeRecurringCampaign(item.id).subscribe({
      next: () => { this.setBusyRecurring(item.id, false); this.loadRecurrentes(); },
      error: (error: { error?: { message?: string } }) => {
        this.setBusyRecurring(item.id, false);
        this.messages.add({ severity: "error", summary: "No se pudo reanudar", detail: error.error?.message });
      },
    });
  }

  eliminarRecurrente(item: RecurringCampaignRecord): void {
    if (!window.confirm(`¿Eliminar el envío recurrente "${item.name}"? Las campañas que ya creó no se borran.`)) return;
    this.setBusyRecurring(item.id, true);
    this.api.deleteRecurringCampaign(item.id).subscribe({
      next: () => { this.setBusyRecurring(item.id, false); this.loadRecurrentes(); },
      error: (error: { error?: { message?: string } }) => {
        this.setBusyRecurring(item.id, false);
        this.messages.add({ severity: "error", summary: "No se pudo eliminar", detail: error.error?.message });
      },
    });
  }
}
