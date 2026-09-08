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
  type CampaignMessagePage,
  type CampaignMessageRecord,
  type CampaignPerformanceSnapshot,
  type CampaignRecord,
  type MediaRecord,
  type RecurringCampaignRecord,
  type SessionRecord,
  type Voto1x10ContactosResult,
  type Voto1x10Jerarquia,
  type Voto1x10Usuario,
} from "../core/api.service";

/**
 * Envíos por Jerarquía 1x10 con gestión integrada de campañas:
 * - Selección por Territorio / Administrador / Gerente / Movilizador
 * - Filtro de audiencia (Solo sin mensaje / Pendientes, Todos, Ya consultados)
 * - Diálogo modal para ver detalle de destinatarios y validación sin desplazarse
 * - Diálogo modal para consultar métricas y mensajes de campañas enviadas
 * - Programación de envíos diarios / periódicos a nuevos votantes no contactados
 */
@Component({
  standalone: true,
  imports: [FormsModule, DatePipe, ButtonModule, CardModule, InputTextModule, MultiSelectModule],
  template: `
    <main class="page">
      <div class="page-header">
        <div>
          <h1>Envíos por jerarquía 1x10</h1>
          <div class="muted">Elegí territorios, administradores, gerentes y/o movilizadores con filtros de audiencia y control total de campañas.</div>
        </div>
        <div class="header-actions">
          <p-button type="button" icon="pi pi-refresh" label="Recargar datos" severity="secondary" size="small" [loading]="loadingJerarquia()" (onClick)="loadJerarquia()" />
        </div>
      </div>

      <div class="grid two top-grid">
        <!-- 1. SELECCIÓN DE JERARQUÍA Y FILTRO DE AUDIENCIA -->
        <p-card header="1. Elegí a quién y filtro de audiencia">
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

              <!-- FILTRO DE ESTADO / AUDIENCIA -->
              <div class="filter-field audience-selector-box">
                <label class="audience-title"><i class="pi pi-filter"></i> Filtro de audiencia en la jerarquía</label>
                <div class="audience-options">
                  <label class="audience-card" [class.selected]="filtroAudiencia() === 'PENDIENTE'">
                    <input type="radio" name="filtroAudiencia" [value]="'PENDIENTE'" [checked]="filtroAudiencia() === 'PENDIENTE'" (change)="setFiltroAudiencia('PENDIENTE')" />
                    <div class="audience-content">
                      <span class="audience-label">🟢 Solo sin mensaje enviado (Pendientes)</span>
                      <small class="audience-sub">Filtra exclusivamente a las personas a las que aún no se les ha enviado ningún mensaje.</small>
                    </div>
                  </label>

                  <label class="audience-card" [class.selected]="filtroAudiencia() === 'NO_VOTO'">
                    <input type="radio" name="filtroAudiencia" [value]="'NO_VOTO'" [checked]="filtroAudiencia() === 'NO_VOTO'" (change)="setFiltroAudiencia('NO_VOTO')" />
                    <div class="audience-content">
                      <span class="audience-label">🗳️ Solo a los que todavía NO votaron (Día D)</span>
                      <small class="audience-sub">Filtra a las personas registradas en la jerarquía que aún no han votado en el Día D.</small>
                    </div>
                  </label>

                  <label class="audience-card" [class.selected]="filtroAudiencia() === 'TODOS'">
                    <input type="radio" name="filtroAudiencia" [value]="'TODOS'" [checked]="filtroAudiencia() === 'TODOS'" (change)="setFiltroAudiencia('TODOS')" />
                    <div class="audience-content">
                      <span class="audience-label">👥 Todos los registrados</span>
                      <small class="audience-sub">Incluye a todas las personas registradas en la jerarquía sin importar su estado.</small>
                    </div>
                  </label>

                  <label class="audience-card" [class.selected]="filtroAudiencia() === 'CONSULTADO'">
                    <input type="radio" name="filtroAudiencia" [value]="'CONSULTADO'" [checked]="filtroAudiencia() === 'CONSULTADO'" (change)="setFiltroAudiencia('CONSULTADO')" />
                    <div class="audience-content">
                      <span class="audience-label">📢 Ya consultados (Re-contacto)</span>
                      <small class="audience-sub">Solo a personas que ya recibieron mensaje previamente y están en estado CONSULTADO.</small>
                    </div>
                  </label>
                </div>
              </div>
            </div>

            <div class="actions selection-actions">
              <span class="muted">{{ totalSeleccionados() }} nivel(es) elegido(s)</span>
              <div class="btn-group">
                <p-button type="button" label="Limpiar" severity="secondary" size="small" [disabled]="totalSeleccionados() === 0" (onClick)="limpiarSeleccion()" />
                <p-button type="button" label="Cargar personas" icon="pi pi-users" [loading]="loadingContactos()" [disabled]="totalSeleccionados() === 0" (onClick)="cargarPersonas()" />
              </div>
            </div>
          }

          @if (contactosResult(); as resultado) {
            <div class="contactos-summary">
              <div><strong>{{ resultado.movilizadorCount }}</strong><span>movilizador(es)</span></div>
              <div><strong>{{ resultado.personaCount }}</strong><span>personas encontradas</span></div>
              <div class="highlight"><strong>{{ resultado.contacts.length }}</strong><span>con celular único</span></div>
            </div>
            
            <div class="modal-trigger-banner">
              <span><i class="pi pi-info-circle"></i> Destinatarios listos para validación y envío.</span>
              <p-button type="button" label="Ver lista completa en ventana emergente" icon="pi pi-eye" size="small" severity="info" (onClick)="abrirModalDestinatarios()" />
            </div>

            @if (resultado.contacts.length === 0) {
              <div class="muted small alert-box">Ninguno de los seleccionados tiene personas con celular cargado para este filtro.</div>
            }
          }
        </p-card>

        <!-- 2. MENSAJE Y ENVÍO -->
        <p-card header="2. Mensaje y envío">
          <form class="form-grid" (ngSubmit)="crearCampania()">
            <label for="cj-name">Nombre de la campaña</label>
            <input pInputText id="cj-name" name="cjName" [(ngModel)]="name" placeholder="Ej: Invitación Compromiso 1x10 - San Roque" />

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
              <div class="session-filters-group">
                <p-multiSelect
                  [options]="estadosDisponibles()"
                  [ngModel]="filtroEstadosSesion()"
                  (ngModelChange)="filtroEstadosSesion.set($event)"
                  optionLabel="label"
                  optionValue="value"
                  placeholder="Filtrar por estados..."
                  [showClear]="true"
                  display="chip"
                  [maxSelectedLabels]="1"
                  styleClass="estado-multiselect"
                />
                <p-multiSelect
                  [options]="municipioOptions()"
                  [ngModel]="filtroMunicipiosSesion()"
                  (ngModelChange)="filtroMunicipiosSesion.set($event)"
                  optionLabel="label"
                  optionValue="value"
                  placeholder="Filtrar por municipio / territorio..."
                  [showClear]="true"
                  display="chip"
                  [maxSelectedLabels]="1"
                  filter="true"
                  filterPlaceHolder="Buscar municipio..."
                  styleClass="municipio-multiselect"
                />
              </div>
            </div>
            <div class="session-quick-actions">
              <span class="muted small">{{ selectedSessionIds().length }} sesión(es) elegida(s) de {{ sesionesDeSeleccionados().length }}</span>
              <div class="btn-group-mini">
                <button type="button" class="btn-mini" (click)="seleccionarTodasConectadas()">Conectadas</button>
                <button type="button" class="btn-mini" (click)="seleccionarTodasVisibles()">Marcar visibles</button>
                <button type="button" class="btn-mini text-muted" (click)="deseleccionarTodasSesiones()">Limpiar</button>
              </div>
            </div>
            @if (!mostrarTodasLasSesiones() && haySeleccionJerarquica() && sesionesDeElegidosCount() === 0) {
              <div class="muted small">Ninguno de los elegidos arriba tiene una sesión de WhatsApp propia todavía.</div>
            }
            <div class="session-options">
              @for (session of sesionesDeSeleccionados(); track session.id) {
                <label class="check-row">
                  <input type="checkbox" [checked]="selectedSessionIds().includes(session.id)" (change)="toggleSession(session.id)" />
                  <span class="session-name">{{ session.name }}</span>
                  <span class="session-pill" [class.connected]="session.status === 'CONNECTED'">{{ session.phoneE164 || sessionStatusLabel(session.status) }}</span>
                </label>
              } @empty {
                <div class="muted">No hay sesiones para este filtro.</div>
              }
            </div>

            <label for="cj-message">Mensaje</label>
            <textarea id="cj-message" name="cjMessage" rows="5" [(ngModel)]="messageText" [placeholder]="'Hola {{nombre}}, queremos invitarte a participar...'"></textarea>
            <div class="contact-help">Variables disponibles: {{ '{{nombre}}' }}, {{ '{{nombre_votante}}' }}.</div>

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

            <div class="validation-action-row">
              <p-button type="button" label="Validar destinatarios" icon="pi pi-check-circle" severity="secondary" [loading]="validating()" [disabled]="!contactosResult()?.contacts?.length" (onClick)="validar()" />
              @if (validationResult(); as val) {
                <div class="validation-badge-summary">
                  <span class="val-pill ok">✅ {{ val.valid }} válidos</span>
                  @if (val.invalid > 0) { <span class="val-pill bad">⚠️ {{ val.invalid }} inválidos</span> }
                  @if (val.duplicates > 0) { <span class="val-pill dup">🔄 {{ val.duplicates }} duplicados</span> }
                  <p-button type="button" label="Ver detalle en diálogo" icon="pi pi-external-link" size="small" severity="help" (onClick)="abrirModalDestinatarios()" />
                </div>
              }
            </div>

            <label class="check-row consent-row">
              <input type="checkbox" [(ngModel)]="consentConfirmed" name="cjConsent" />
              <span>Confirmo que estas personas pertenecen al padrón autorizado de la campaña electoral 1x10.</span>
            </label>

            <p-button type="submit" label="Crear campaña" icon="pi pi-send" severity="primary" [loading]="saving()" [disabled]="saving() || !contactosResult()?.contacts?.length" />
          </form>

          @if (ultimaCampaniaCreada(); as campania) {
            <div class="created-box">
              <div class="created-info">
                <i class="pi pi-check-circle"></i>
                <span>Campaña <strong>{{ campania.name }}</strong> creada en borrador con {{ campania.totalMessages }} destinatario(s).</span>
              </div>
              <div class="created-actions">
                <p-button type="button" label="Iniciar ahora" icon="pi pi-play" severity="success" size="small" [loading]="starting()" (onClick)="iniciarCampania(campania.id)" />
                <p-button type="button" label="Ver detalle de campaña" icon="pi pi-eye" severity="secondary" size="small" (onClick)="abrirDetalleCampaniaPorId(campania.id)" />
              </div>
            </div>
          }
        </p-card>
      </div>

      <!-- 3. ENVIOS DIARIOS / PROGRAMACIÓN AUTOMÁTICA -->
      <p-card header="3. Envíos diarios y automáticos a nuevos no consultados" styleClass="recurring-card">
        <div class="muted">
          Programa un despacho recurrente para la jerarquía seleccionada arriba: en cada ejecución busca automáticamente a los <strong>nuevos contactos en estado PENDIENTE</strong> que aún no hayan sido consultados, envía los mensajes y los marca como CONSULTADOS.
        </div>

        <div class="form-grid recurring-form">
          <div class="recurring-col">
            <label for="cj-rec-interval">Frecuencia de envío automático</label>
            <select id="cj-rec-interval" name="cjRecInterval" [(ngModel)]="recurringIntervalMinutes" [ngModelOptions]="{ standalone: true }">
              @for (preset of intervalPresets; track preset.minutes) {
                <option [value]="preset.minutes">{{ preset.label }}</option>
              }
            </select>
          </div>

          <div class="recurring-col recurring-action-col">
            <p-button
              type="button"
              label="Guardar envío diario / automático"
              icon="pi pi-calendar-plus"
              severity="help"
              [loading]="savingRecurring()"
              [disabled]="totalSeleccionados() === 0 || !name.trim() || selectedSessionIds().length === 0"
              (onClick)="crearRecurrente()"
            />
          </div>

          <div class="contact-help">
            Usa el nombre, sesiones, mensaje, multimedia, región y la jerarquía con filtro de audiencia configurados arriba.
          </div>
        </div>

        @if (recurrentesJerarquia().length > 0) {
          <div class="recurring-table-wrap">
            <table class="recurring-table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Frecuencia</th>
                  <th>Sesiones</th>
                  <th>Estado</th>
                  <th>Última corrida</th>
                  <th>Resultado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                @for (item of recurrentesJerarquia(); track item.id) {
                  <tr>
                    <td><strong>{{ item.name }}</strong></td>
                    <td>{{ intervalLabel(item.intervalMinutes) }}</td>
                    <td>
                      <span class="session-pill" [class.connected]="item.sessionIds.length > 0" [title]="getSessionNames(item.sessionIds)">
                        {{ item.sessionIds.length }} sesión(es)
                      </span>
                    </td>
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
                      <p-button type="button" icon="pi pi-pencil" severity="info" size="small" (onClick)="abrirModalEditarRecurrente(item)" title="Editar sesiones y mensaje" />
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
          <div class="muted" style="margin-top:.8rem">Todavía no configuraste ningún envío automático diario por jerarquía.</div>
        }
      </p-card>

      <!-- 4. CONSULTA Y GESTIÓN DE CAMPAÑAS ENVIADAS -->
      <p-card header="4. Campañas enviadas y en curso" styleClass="recurring-card">
        <div class="campaign-list-header">
          <div class="muted">Consulta el estado en tiempo real, inicia borradores, pausa o cancela envíos y abre el detalle completo en diálogo.</div>
          <p-button type="button" icon="pi pi-refresh" label="Actualizar campañas" severity="secondary" size="small" [loading]="loadingCampanias()" (onClick)="loadCampanias()" />
        </div>

        @if (loadingCampanias()) {
          <div class="muted">Cargando campañas...</div>
        } @else if (campanias().length === 0) {
          <div class="muted">Todavía no creaste ninguna campaña.</div>
        } @else {
          <div class="recurring-table-wrap">
            <table class="recurring-table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Jerarquía</th>
                  <th>Estado</th>
                  <th>Destinatarios</th>
                  <th>Enviados</th>
                  <th>Fallidos</th>
                  <th>Fecha</th>
                  <th style="min-width: 170px;">Acciones</th>
                </tr>
              </thead>
              <tbody>
                @for (campania of campanias(); track campania.id) {
                  <tr>
                    <td><strong>{{ campania.name }}</strong></td>
                    <td>
                      @if (campania.jerarquiaResumen) {
                        <span class="jerarquia-tag">{{ campania.jerarquiaResumen }}</span>
                      } @else {
                        <span class="muted small">—</span>
                      }
                    </td>
                    <td>
                      <span class="status-pill" [class.paused]="campania.status === 'PAUSED' || campania.status === 'DRAFT'" [class.running]="campania.status === 'RUNNING'" [class.completed]="campania.status === 'COMPLETED'">
                        {{ campaignStatusLabel(campania.status) }}
                      </span>
                    </td>
                    <td>{{ campania.totalMessages }}</td>
                    <td><span class="text-success font-bold">{{ campania.sentMessages }}</span></td>
                    <td><span class="text-danger font-bold">{{ campania.failedMessages }}</span></td>
                    <td>{{ campania.createdAt | date:'short' }}</td>
                    <td class="actions">
                      @if (campania.status === 'DRAFT') {
                        <p-button type="button" icon="pi pi-play" label="Iniciar" severity="success" size="small" [loading]="startingCampaignId() === campania.id" (onClick)="iniciarCampania(campania.id)" />
                      } @else if (campania.status === 'RUNNING') {
                        <p-button type="button" icon="pi pi-pause" severity="warn" size="small" title="Pausar" (onClick)="pausarCampania(campania.id)" />
                      } @else if (campania.status === 'PAUSED') {
                        <p-button type="button" icon="pi pi-play" severity="success" size="small" title="Reanudar" (onClick)="reanudarCampania(campania.id)" />
                      }
                      
                      @if (campania.status === 'RUNNING' || campania.status === 'PAUSED') {
                        <p-button type="button" icon="pi pi-times" severity="danger" size="small" title="Cancelar" (onClick)="cancelarCampania(campania.id)" />
                      }

                      <p-button type="button" icon="pi pi-eye" label="Detalle" severity="info" size="small" (onClick)="abrirDetalleCampania(campania)" />
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </p-card>
    </main>

    <!-- ========================================== -->
    <!-- MODAL 1: DIÁLOGO DE DESTINATARIOS Y VALIDACIÓN -->
    <!-- ========================================== -->
    @if (modalDestinatariosVisible()) {
      <div class="custom-modal-backdrop" (click)="cerrarModalDestinatarios()">
        <div class="custom-modal modal-large" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <div class="modal-title-box">
              <h2><i class="pi pi-users"></i> Destinatarios y Validación (1x10)</h2>
              <span class="muted small">Filtro aplicado: {{ audienciaLabel(filtroAudiencia()) }} · {{ totalContactosCargados() }} contactos cargados</span>
            </div>
            <button type="button" class="close-btn" (click)="cerrarModalDestinatarios()"><i class="pi pi-times"></i></button>
          </div>

          <div class="modal-body">
            @if (validationResult(); as validacion) {
              <div class="validation-summary">
                <div><strong>{{ validacion.valid }}</strong><span>válidos</span></div>
                <div><strong>{{ validacion.duplicates }}</strong><span>duplicados</span></div>
                <div><strong>{{ validacion.invalid }}</strong><span>inválidos</span></div>
                <div class="highlight"><strong>{{ validacion.sendable }}</strong><span>a enviar</span></div>
              </div>
            }

            <div class="lista-numeros">
              <div class="lista-toolbar">
                <div class="lista-tabs">
                  <button type="button" class="tab-btn" [class.active]="listaTab() === 'todos'" (click)="listaTab.set('todos')">
                    Todos ({{ contactosResult()?.contacts?.length ?? 0 }})
                  </button>
                  @if (validationResult(); as val) {
                    <button type="button" class="tab-btn" [class.active]="listaTab() === 'validos'" (click)="listaTab.set('validos')">
                      Válidos ({{ val.valid }})
                    </button>
                    <button type="button" class="tab-btn" [class.active]="listaTab() === 'invalidos'" (click)="listaTab.set('invalidos')">
                      Inválidos ({{ val.invalid }})
                    </button>
                    <button type="button" class="tab-btn" [class.active]="listaTab() === 'duplicados'" (click)="listaTab.set('duplicados')">
                      Duplicados ({{ val.duplicates }})
                    </button>
                  }
                </div>
                <input pInputText type="text" class="filtro-input" placeholder="Buscar por nombre o celular..." [(ngModel)]="filtroNumeros" name="filtroNumeros" />
              </div>

              <div class="modal-table-scroll">
                @if (listaTab() === 'todos') {
                  <div class="numeros-list">
                    @for (contacto of todosContactosFiltrados(); track contacto.phone) {
                      <div class="numero-row">
                        <span class="numero-e164">{{ contacto.phone }}</span>
                        <span class="numero-name">{{ contacto.name || 'Sin nombre registrado' }}</span>
                        <span class="numero-badge">Contacto 1x10</span>
                      </div>
                    } @empty {
                      <div class="muted small p-3">No hay destinatarios que coincidan con la búsqueda.</div>
                    }
                  </div>
                }

                @if (validationResult(); as val) {
                  @if (listaTab() === 'validos') {
                    <div class="numeros-list">
                      @for (item of validosFiltrados(val); track item.sourceIndex) {
                        <div class="numero-row ok">
                          <span class="numero-e164">{{ item.e164 }}</span>
                          <span class="numero-raw">{{ item.raw }}</span>
                          <span class="numero-name">{{ item.name || 'Sin nombre' }}</span>
                          <span class="numero-badge ok">Listo</span>
                        </div>
                      } @empty {
                        <div class="muted small p-3">Sin resultados para ese filtro.</div>
                      }
                    </div>
                  }

                  @if (listaTab() === 'invalidos') {
                    <div class="numeros-list">
                      @for (item of invalidosFiltrados(val); track item.sourceIndex) {
                        <div class="numero-row bad">
                          <span class="numero-e164">{{ item.phone }}</span>
                          <span class="numero-name">{{ item.name || 'Sin nombre' }}</span>
                          <span class="numero-reason">{{ item.reason }}</span>
                        </div>
                      } @empty {
                        <div class="muted small p-3">No hay números inválidos.</div>
                      }
                    </div>
                  }

                  @if (listaTab() === 'duplicados') {
                    <div class="numeros-list">
                      @for (item of duplicadosFiltrados(val); track item.sourceIndex) {
                        <div class="numero-row dup">
                          <span class="numero-e164">{{ item.e164 }}</span>
                          <span class="numero-raw">{{ item.phone }}</span>
                          <span class="numero-name">{{ item.name || 'Sin nombre' }}</span>
                          <span class="numero-badge dup">Duplicado</span>
                        </div>
                      } @empty {
                        <div class="muted small p-3">No hay números duplicados.</div>
                      }
                    </div>
                  }
                }
              </div>
            </div>
          </div>

          <div class="modal-footer">
            <p-button type="button" label="Cerrar" severity="secondary" (onClick)="cerrarModalDestinatarios()" />
          </div>
        </div>
      </div>
    }

    <!-- ========================================== -->
    <!-- MODAL 2: DIÁLOGO DE DETALLE DE CAMPAÑA -->
    <!-- ========================================== -->
    @if (modalDetalleCampaniaVisible()) {
      <div class="custom-modal-backdrop" (click)="cerrarModalDetalleCampania()">
        <div class="custom-modal modal-xlarge" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <div class="modal-title-box">
              <h2><i class="pi pi-send"></i> Detalle de Campaña: {{ campaniaSeleccionada()?.name }}</h2>
              <div class="modal-sub">
                <span class="status-pill" [class.paused]="campaniaSeleccionada()?.status === 'PAUSED' || campaniaSeleccionada()?.status === 'DRAFT'" [class.running]="campaniaSeleccionada()?.status === 'RUNNING'" [class.completed]="campaniaSeleccionada()?.status === 'COMPLETED'">
                  {{ campaignStatusLabel(campaniaSeleccionada()?.status ?? '') }}
                </span>
                @if (campaniaSeleccionada()?.jerarquiaResumen) {
                  <span class="jerarquia-tag">{{ campaniaSeleccionada()?.jerarquiaResumen }}</span>
                }
              </div>
            </div>
            <button type="button" class="close-btn" (click)="cerrarModalDetalleCampania()"><i class="pi pi-times"></i></button>
          </div>

          <div class="modal-body">
            @if (loadingDetalleCampania()) {
              <div class="muted p-4 text-center">Cargando métricas y mensajes de la campaña…</div>
            } @else {
              <!-- MÉTRICAS EN TIEMPO REAL -->
              <div class="campaign-metrics-grid">
                <div class="metric-card">
                  <span>Total</span>
                  <strong>{{ campaniaSeleccionada()?.totalMessages ?? 0 }}</strong>
                </div>
                <div class="metric-card ok">
                  <span>Enviados</span>
                  <strong>{{ campaniaSeleccionada()?.sentMessages ?? 0 }}</strong>
                </div>
                <div class="metric-card proc">
                  <span>En proceso</span>
                  <strong>{{ mensajesEnProcesoCount() }}</strong>
                </div>
                <div class="metric-card fail">
                  <span>Fallidos</span>
                  <strong>{{ campaniaSeleccionada()?.failedMessages ?? 0 }}</strong>
                </div>
                <div class="metric-card pend">
                  <span>Pendientes</span>
                  <strong>{{ mensajesPendientesCount() }}</strong>
                </div>
              </div>

              <!-- ACCIONES DE CAMPAÑA DENTRO DEL MODAL -->
              <div class="modal-actions-bar">
                <div class="action-buttons-left">
                  @if (campaniaSeleccionada()?.status === 'DRAFT') {
                    <p-button type="button" icon="pi pi-play" label="Iniciar campaña" severity="success" size="small" [loading]="startingCampaignId() === campaniaSeleccionada()?.id" (onClick)="iniciarCampania(campaniaSeleccionada()!.id)" />
                  } @else if (campaniaSeleccionada()?.status === 'RUNNING') {
                    <p-button type="button" icon="pi pi-pause" label="Pausar" severity="warn" size="small" (onClick)="pausarCampania(campaniaSeleccionada()!.id)" />
                  } @else if (campaniaSeleccionada()?.status === 'PAUSED') {
                    <p-button type="button" icon="pi pi-play" label="Reanudar" severity="success" size="small" (onClick)="reanudarCampania(campaniaSeleccionada()!.id)" />
                  }

                  @if (campaniaSeleccionada()?.status === 'RUNNING' || campaniaSeleccionada()?.status === 'PAUSED') {
                    <p-button type="button" icon="pi pi-times" label="Cancelar" severity="danger" size="small" (onClick)="cancelarCampania(campaniaSeleccionada()!.id)" />
                  }
                </div>

                <div class="action-buttons-right">
                  <input pInputText type="text" placeholder="Filtrar mensajes..." [(ngModel)]="filtroMensajesCampania" name="filtroMensajesCampania" class="filtro-input" />
                  <p-button type="button" icon="pi pi-refresh" severity="secondary" size="small" title="Actualizar mensajes" (onClick)="recargarMensajesCampaniaSeleccionada()" />
                </div>
              </div>

              <!-- TABLA DE MENSAJES -->
              <div class="modal-table-scroll messages-table-wrap">
                <table class="recurring-table">
                  <thead>
                    <tr>
                      <th>Destinatario</th>
                      <th>Teléfono</th>
                      <th>Estado</th>
                      <th>Intentos</th>
                      <th>Hora de Envío</th>
                      <th>Detalle / Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (msg of mensajesCampaniaFiltrados(); track msg.id) {
                      <tr>
                        <td><strong>{{ msg.contactName || '—' }}</strong></td>
                        <td><code>{{ msg.recipientE164 || msg.recipientRaw }}</code></td>
                        <td>
                          <span class="status-pill" [class.running]="msg.status === 'SUBMITTED' || msg.status === 'PROCESSING'" [class.completed]="msg.status === 'SENT' || msg.status === 'DELIVERED'" [class.paused]="msg.status === 'PENDING' || msg.status === 'HELD'" [class.fail]="msg.status === 'FAILED'">
                            {{ msg.status }}
                          </span>
                        </td>
                        <td>{{ msg.attemptCount }} / {{ msg.maxAttempts }}</td>
                        <td>{{ msg.sentAt ? (msg.sentAt | date:'shortTime') : '—' }}</td>
                        <td>
                          @if (msg.lastErrorMessage) {
                            <span class="text-danger small">{{ msg.lastErrorMessage }}</span>
                          } @else if (msg.status === 'SENT' || msg.status === 'DELIVERED') {
                            <span class="text-success small">Entregado correctamente</span>
                          } @else {
                            <span class="muted small">—</span>
                          }
                        </td>
                      </tr>
                    } @empty {
                      <tr>
                        <td colspan="6" class="muted text-center p-3">No hay mensajes registrados para esta campaña o no coinciden con el filtro.</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </div>

          <div class="modal-footer">
            <p-button type="button" label="Cerrar" severity="secondary" (onClick)="cerrarModalDetalleCampania()" />
          </div>
        </div>
      </div>
    }

    <!-- ========================================== -->
    <!-- MODAL 3: DIÁLOGO DE EDICIÓN DE CAMPAÑA RECURRENTE -->
    <!-- ========================================== -->
    @if (modalEditarRecurrenteVisible()) {
      <div class="custom-modal-backdrop" (click)="cerrarModalEditarRecurrente()">
        <div class="custom-modal modal-large" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <div class="modal-title-box">
              <h2><i class="pi pi-pencil"></i> Editar Envío Recurrente</h2>
              <span class="muted small">{{ itemRecurrenteSeleccionado()?.name }}</span>
            </div>
            <button type="button" class="close-btn" (click)="cerrarModalEditarRecurrente()"><i class="pi pi-times"></i></button>
          </div>

          <div class="modal-body">
            <div class="form-grid">
              <label for="edit-rec-name">Nombre de la campaña</label>
              <input pInputText id="edit-rec-name" name="editRecName" [(ngModel)]="editRecurrenteName" />

              <label for="edit-rec-interval">Frecuencia de envío automático</label>
              <select id="edit-rec-interval" name="editRecInterval" [(ngModel)]="editRecurrenteIntervalMinutes">
                @for (preset of intervalPresets; track preset.minutes) {
                  <option [value]="preset.minutes">{{ preset.label }}</option>
                }
              </select>

              <label>Sesiones emisoras de WhatsApp ({{ editRecurrenteSessionIds().length }} seleccionada(s))</label>
              <div class="session-toolbar">
                <div class="session-filters-group">
                  <p-multiSelect
                    [options]="estadosDisponibles()"
                    [ngModel]="editFiltroEstadosSesion()"
                    (ngModelChange)="editFiltroEstadosSesion.set($event)"
                    optionLabel="label"
                    optionValue="value"
                    placeholder="Filtrar por estados..."
                    [showClear]="true"
                    display="chip"
                    [maxSelectedLabels]="1"
                    styleClass="estado-multiselect"
                  />
                  <p-multiSelect
                    [options]="municipioOptions()"
                    [ngModel]="editFiltroMunicipiosSesion()"
                    (ngModelChange)="editFiltroMunicipiosSesion.set($event)"
                    optionLabel="label"
                    optionValue="value"
                    placeholder="Filtrar por municipio / territorio..."
                    [showClear]="true"
                    display="chip"
                    [maxSelectedLabels]="1"
                    filter="true"
                    filterPlaceHolder="Buscar municipio..."
                    styleClass="municipio-multiselect"
                  />
                </div>
                <div class="btn-group-mini">
                  <button type="button" class="btn-mini" (click)="editSeleccionarTodasConectadas()">Conectadas</button>
                  <button type="button" class="btn-mini" (click)="editSeleccionarTodasVisibles()">Marcar visibles</button>
                  <button type="button" class="btn-mini text-muted" (click)="editDeseleccionarTodasSesiones()">Limpiar</button>
                </div>
              </div>

              <div class="session-options edit-session-options">
                @for (session of editSesionesFiltradas(); track session.id) {
                  <label class="check-row">
                    <input type="checkbox" [checked]="editRecurrenteSessionIds().includes(session.id)" (change)="toggleEditSession(session.id)" />
                    <span class="session-name">{{ session.name }}</span>
                    <span class="session-pill" [class.connected]="session.status === 'CONNECTED'">{{ session.phoneE164 || sessionStatusLabel(session.status) }}</span>
                  </label>
                } @empty {
                  <div class="muted">No hay sesiones para este filtro.</div>
                }
              </div>

              <label for="edit-rec-message">Mensaje</label>
              <textarea id="edit-rec-message" name="editRecMessage" rows="4" [(ngModel)]="editRecurrenteMessageText"></textarea>
              <div class="contact-help">Variables disponibles: {{ '{{nombre}}' }}, {{ '{{nombre_votante}}' }}.</div>

              <label for="edit-rec-media">Multimedia (opcional)</label>
              <select id="edit-rec-media" name="editRecMedia" [(ngModel)]="editRecurrenteMediaAssetId">
                <option value="">Sin multimedia</option>
                @for (item of mediaItems(); track item.id) {
                  <option [value]="item.id">{{ item.fileName }}</option>
                }
              </select>

              <label for="edit-rec-region">País / región por defecto</label>
              <select id="edit-rec-region" name="editRecRegion" [(ngModel)]="editRecurrenteDefaultRegion">
                @for (region of regionOptions; track region.code) {
                  <option [value]="region.code">{{ region.label }}</option>
                }
              </select>
            </div>
          </div>

          <div class="modal-footer">
            <p-button type="button" label="Cancelar" severity="secondary" (onClick)="cerrarModalEditarRecurrente()" />
            <p-button
              type="button"
              label="Guardar cambios"
              icon="pi pi-check"
              severity="primary"
              [loading]="savingEditRecurring()"
              [disabled]="!editRecurrenteName.trim() || editRecurrenteSessionIds().length === 0"
              (onClick)="guardarEdicionRecurrente()"
            />
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .page-header{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:1rem;margin-bottom:1.2rem}
    .top-grid{align-items:start}
    .hierarchy-filters{display:flex;flex-direction:column;gap:.9rem}
    .filter-field{display:flex;flex-direction:column;gap:.35rem}
    .filter-field label{font-size:.85rem;font-weight:600;color:#334155}
    .filter-field p-multiselect{display:block;width:100%}
    .check-row{display:flex;align-items:center;gap:.5rem;font-size:.82rem;font-weight:400;cursor:pointer}
    .consent-row{padding:.6rem .8rem;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px}
    .small{font-size:.75rem}
    .selection-actions{margin-top:.9rem;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:.5rem}
    .btn-group{display:flex;gap:.4rem}
    
    /* AUDIENCE CARDS */
    .audience-selector-box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:.8rem;margin-top:.4rem}
    .audience-title{display:flex;align-items:center;gap:.4rem;color:#0f172a;font-weight:700;margin-bottom:.4rem}
    .audience-options{display:flex;flex-direction:column;gap:.45rem}
    .audience-card{display:flex;align-items:flex-start;gap:.6rem;padding:.55rem .75rem;border:1px solid #cbd5e1;border-radius:8px;background:#fff;cursor:pointer;transition:all .15s ease}
    .audience-card:hover{border-color:#3b82f6;background:#f0f7ff}
    .audience-card.selected{border-color:#2563eb;background:#eff6ff;box-shadow:0 0 0 1px #2563eb}
    .audience-content{display:flex;flex-direction:column;gap:.1rem}
    .audience-label{font-size:.82rem;font-weight:700;color:#1e293b}
    .audience-sub{font-size:.72rem;color:#64748b}

    /* SUMMARY BADGES */
    .contactos-summary{display:grid;grid-template-columns:repeat(3,minmax(100px,1fr));gap:.5rem;margin-top:.9rem}
    .contactos-summary>div{display:grid;gap:.1rem;border:1px solid #e2e8f0;border-radius:9px;padding:.6rem;background:#f8fafc;text-align:center}
    .contactos-summary>div.highlight{border-color:#3b82f6;background:#eff6ff;color:#1d4ed8}
    .contactos-summary span{font-size:.72rem;color:#64748b}
    .contactos-summary strong{font-size:1.2rem}
    .modal-trigger-banner{margin-top:.7rem;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.5rem;background:#f1f5f9;border-radius:8px;padding:.6rem .8rem;font-size:.8rem;color:#334155}
    .alert-box{margin-top:.5rem;padding:.5rem .7rem;background:#fff1f2;border:1px solid #fecdd3;border-radius:7px;color:#be123c}

    /* VALIDATION BADGES */
    .validation-action-row{display:flex;align-items:center;flex-wrap:wrap;gap:.7rem;margin-top:.2rem}
    .validation-badge-summary{display:flex;align-items:center;flex-wrap:wrap;gap:.4rem}
    .val-pill{padding:.25rem .55rem;border-radius:6px;font-size:.75rem;font-weight:700}
    .val-pill.ok{background:#dcfce7;color:#15803d}
    .val-pill.bad{background:#fee2e2;color:#b91c1c}
    .val-pill.dup{background:#fef3c7;color:#b45309}

    .created-box{margin-top:1rem;display:flex;flex-direction:column;gap:.6rem;border:1px solid #bbf7d0;background:#f0fdf4;border-radius:10px;padding:.8rem .9rem;font-size:.85rem}
    .created-info{display:flex;align-items:center;gap:.6rem}
    .created-info i{color:#16a34a;font-size:1.2rem}
    .created-actions{display:flex;gap:.5rem;flex-wrap:wrap}

    /* SESSIONS */
    .session-toolbar{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:.5rem;margin-bottom:.4rem}
    .session-toggle{display:flex;gap:.35rem;flex-wrap:wrap}
    .session-filters-group{display:flex;gap:.4rem;flex-wrap:wrap;align-items:center}
    .session-quick-actions{display:flex;justify-content:space-between;align-items:center;margin-bottom:.3rem;flex-wrap:wrap;gap:.4rem}
    .btn-group-mini{display:flex;gap:.3rem}
    .btn-mini{background:#e2e8f0;border:none;border-radius:6px;padding:.2rem .5rem;font-size:.72rem;font-weight:600;color:#334155;cursor:pointer;transition:all .15s ease}
    .btn-mini:hover{background:#cbd5e1;color:#0f172a}
    .btn-mini.text-muted{background:none;border:1px solid #e2e8f0}
    .estado-multiselect{min-width:190px}
    .municipio-multiselect{min-width:210px}
    .session-options{max-height:140px;overflow-y:auto;display:flex;flex-direction:column;gap:.3rem;border:1px solid #e2e8f0;padding:.5rem;border-radius:8px;background:#f8fafc}
    .edit-session-options{max-height:180px}
    .session-name{font-weight:600;color:#1e293b}
    .session-pill{font-size:.72rem;padding:.15rem .45rem;border-radius:999px;background:#e2e8f0;color:#475569}
    .session-pill.connected{background:#dcfce7;color:#15803d;font-weight:700}

    /* RECURRING */
    .recurring-card{margin-top:1.2rem}
    .recurring-form{grid-template-columns:1fr auto;align-items:flex-end;gap:.8rem 1rem}
    .recurring-col{display:flex;flex-direction:column;gap:.35rem}
    .recurring-form select{width:100%;max-width:300px;border:1px solid #cbd5e1;padding:.5rem;border-radius:8px}
    .recurring-form .contact-help{grid-column:1/-1}
    .jerarquia-tag{display:inline-block;background:#eef2ff;color:#3730a3;border-radius:7px;padding:.2rem .5rem;font-size:.72rem;font-weight:600;max-width:260px;white-space:normal}
    .recurring-table-wrap{overflow-x:auto;margin-top:1rem}
    .recurring-table{width:100%;border-collapse:collapse;font-size:.85rem}
    .recurring-table th{text-align:left;color:#64748b;font-size:.72rem;text-transform:uppercase;letter-spacing:.03em;padding:.5rem .6rem;border-bottom:2px solid #e2e8f0;background:#f8fafc}
    .recurring-table td{padding:.6rem .6rem;border-bottom:1px solid #f1f5f9;vertical-align:middle}
    .recurring-table td.actions{display:flex;gap:.35rem;align-items:center}
    .campaign-list-header{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:.5rem}

    .status-pill{background:#e2e8f0;color:#475569;border-radius:999px;padding:.2rem .6rem;font-size:.72rem;font-weight:700;display:inline-block}
    .status-pill.running{background:#dbeafe;color:#1e40af}
    .status-pill.completed{background:#dcfce7;color:#15803d}
    .status-pill.paused{background:#fef3c7;color:#92400e}
    .status-pill.fail{background:#fee2e2;color:#b91c1c}
    .outcome{font-weight:700;font-size:.8rem}
    .outcome.created{color:#027a48}
    .outcome.empty{color:#64748b}
    .outcome.error{color:#b42318}
    .text-success{color:#15803d}
    .text-danger{color:#dc2626}
    .font-bold{font-weight:700}

    /* CUSTOM MODAL OVERLAYS */
    .custom-modal-backdrop{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(15,23,42,0.65);backdrop-filter:blur(4px);z-index:9999;display:flex;align-items:center;justify-content:center;padding:1rem}
    .custom-modal{background:#ffffff;border-radius:14px;box-shadow:0 20px 25px -5px rgba(0,0,0,0.2), 0 8px 10px -6px rgba(0,0,0,0.1);display:flex;flex-direction:column;max-height:90vh;overflow:hidden;animation:modalIn .18s ease-out}
    @keyframes modalIn{from{opacity:0;transform:scale(0.96)}to{opacity:1;transform:scale(1)}}
    .modal-large{width:100%;max-width:850px}
    .modal-xlarge{width:100%;max-width:1100px}
    .modal-header{display:flex;justify-content:space-between;align-items:center;padding:1rem 1.4rem;border-bottom:1px solid #e2e8f0;background:#f8fafc}
    .modal-title-box h2{margin:0;font-size:1.15rem;color:#0f172a;display:flex;align-items:center;gap:.5rem}
    .modal-sub{display:flex;align-items:center;gap:.5rem;margin-top:.25rem;flex-wrap:wrap}
    .close-btn{background:none;border:none;font-size:1.2rem;color:#64748b;cursor:pointer;padding:.4rem;border-radius:6px;transition:all .15s}
    .close-btn:hover{background:#e2e8f0;color:#0f172a}
    .modal-body{padding:1.2rem 1.4rem;overflow-y:auto;display:flex;flex-direction:column;gap:1rem;flex:1}
    .modal-footer{padding:.8rem 1.4rem;border-top:1px solid #e2e8f0;background:#f8fafc;display:flex;justify-content:flex-end;gap:.5rem}
    .modal-table-scroll{max-height:380px;overflow-y:auto;border:1px solid #e2e8f0;border-radius:8px;background:#fff}

    /* MODAL 1 LIST */
    .lista-numeros{border:1px solid #e2e8f0;border-radius:10px;padding:.7rem;display:flex;flex-direction:column;gap:.6rem;background:#fff}
    .lista-toolbar{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:.5rem}
    .lista-tabs{display:flex;gap:.35rem;flex-wrap:wrap}
    .tab-btn{border:1px solid #e2e8f0;background:#f8fafc;border-radius:999px;padding:.35rem .75rem;font-size:.78rem;font-weight:600;color:#475569;cursor:pointer}
    .tab-btn.active{background:#0f172a;border-color:#0f172a;color:#fff}
    .filtro-input{min-width:200px}
    .numeros-list{display:flex;flex-direction:column}
    .numero-row{display:grid;grid-template-columns:minmax(120px,auto) minmax(130px,1fr) minmax(100px,auto);gap:.6rem;font-size:.82rem;padding:.5rem .7rem;border-bottom:1px solid #f1f5f9;align-items:center}
    .numero-row:hover{background:#f8fafc}
    .numero-row.ok .numero-e164{color:#15803d;font-weight:700}
    .numero-row.bad .numero-e164{color:#b91c1c;font-weight:700}
    .numero-row.dup .numero-e164{color:#b45309;font-weight:700}
    .numero-name{color:#1e293b;font-weight:500}
    .numero-raw{color:#64748b;font-size:.78rem}
    .numero-reason{color:#dc2626;font-size:.75rem}
    .numero-badge{font-size:.7rem;padding:.15rem .45rem;border-radius:4px;background:#e2e8f0;color:#475569;justify-self:end}
    .numero-badge.ok{background:#dcfce7;color:#15803d;font-weight:700}
    .numero-badge.dup{background:#fef3c7;color:#b45309;font-weight:700}

    /* MODAL 2 CAMPAIGN METRICS */
    .campaign-metrics-grid{display:grid;grid-template-columns:repeat(5,minmax(80px,1fr));gap:.5rem}
    .metric-card{display:flex;flex-direction:column;gap:.2rem;border:1px solid #e2e8f0;border-radius:9px;padding:.6rem;background:#f8fafc;text-align:center}
    .metric-card span{font-size:.72rem;color:#64748b;text-transform:uppercase}
    .metric-card strong{font-size:1.3rem;color:#0f172a}
    .metric-card.ok{border-color:#86efac;background:#f0fdf4}
    .metric-card.ok strong{color:#15803d}
    .metric-card.proc{border-color:#93c5fd;background:#eff6ff}
    .metric-card.proc strong{color:#1d4ed8}
    .metric-card.fail{border-color:#fca5a5;background:#fef2f2}
    .metric-card.fail strong{color:#b91c1c}
    .metric-card.pend{border-color:#cbd5e1;background:#f8fafc}
    .modal-actions-bar{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:.6rem;padding:.5rem 0}
    .action-buttons-left{display:flex;gap:.4rem;flex-wrap:wrap}
    .action-buttons-right{display:flex;gap:.4rem;align-items:center}
    .messages-table-wrap{max-height:340px}

    @media(max-width:900px){
      .top-grid{grid-template-columns:1fr}
      .campaign-metrics-grid{grid-template-columns:repeat(3,1fr)}
    }
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

  /** Filtro de estado de apoyo / audiencia */
  readonly filtroAudiencia = signal<"PENDIENTE" | "NO_VOTO" | "TODOS" | "CONSULTADO">("PENDIENTE");

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

  /** Resumen legible de la jerarquía elegida */
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

    partes.push(`Audiencia: ${this.audienciaLabel(this.filtroAudiencia())}`);
    const resumen = partes.join(" · ");
    return resumen.length > 500 ? `${resumen.slice(0, 497)}...` : resumen;
  });

  readonly loadingContactos = signal(false);
  readonly contactosResult = signal<Voto1x10ContactosResult | null>(null);

  readonly sessions = signal<SessionRecord[]>([]);
  readonly connectedSessions = signal<SessionRecord[]>([]);
  readonly selectedSessionIds = signal<string[]>([]);
  readonly mostrarTodasLasSesiones = signal(false);
  readonly filtroEstadoSesion = signal("");

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

  private readonly sesionesBase = computed<SessionRecord[]>(() =>
    this.mostrarTodasLasSesiones() || !this.haySeleccionJerarquica() ? this.sessions() : this.coincidenciasSesionesElegidos());

  readonly filtroEstadosSesion = signal<string[]>([]);
  readonly filtroMunicipiosSesion = signal<string[]>([]);

  readonly estadosDisponibles = computed<{ value: string; label: string }[]>(() => {
    const raw = [...new Set(this.sesionesBase().map((s) => s.status))];
    raw.sort((a, b) => {
      if (a === "CONNECTED") return -1;
      if (b === "CONNECTED") return 1;
      return a.localeCompare(b);
    });
    return raw.map((st) => ({
      value: st,
      label: `${this.sessionStatusLabel(st)} (${this.sesionesBase().filter((s) => s.status === st).length})`,
    }));
  });

  readonly municipioOptions = computed(() => {
    const nombres = new Set<string>();

    const terrs = this.jerarquia()?.territorios ?? [];
    for (const t of terrs) {
      if (t.nombre && t.nombre.trim()) {
        nombres.add(t.nombre.trim().toUpperCase());
      }
    }

    for (const s of this.sessions()) {
      const parts = s.name.split(/[_·-]/);
      if (parts.length > 1 && parts[0].trim().length >= 3) {
        const candidate = parts[0].trim();
        if (!/^u\d+$/i.test(candidate) && !/^\d+$/.test(candidate)) {
          nombres.add(candidate.toUpperCase());
        }
      }
    }

    return Array.from(nombres)
      .sort((a, b) => a.localeCompare(b))
      .map((nombre) => ({
        value: nombre,
        label: nombre,
      }));
  });

  readonly sesionesDeSeleccionados = computed<SessionRecord[]>(() => {
    const base = this.sesionesBase();
    const estados = this.filtroEstadosSesion();
    const municipios = this.filtroMunicipiosSesion();
    return base.filter((session) => {
      if (estados.length > 0 && !estados.includes(session.status)) {
        return false;
      }
      if (municipios.length > 0) {
        const nameUpper = session.name.toUpperCase();
        const coincide = municipios.some((m) => {
          const mUpper = m.toUpperCase();
          if (nameUpper.includes(mUpper)) return true;
          const userMatch = session.name.match(/^u(\d+)/i);
          if (userMatch && this.jerarquia()) {
            const uid = parseInt(userMatch[1], 10);
            const user = [
              ...(this.jerarquia()?.administradores ?? []),
              ...(this.jerarquia()?.gerentes ?? []),
              ...(this.jerarquia()?.movilizadores ?? []),
            ].find((u) => u.idUsuario === uid);
            if (user?.territorio && user.territorio.toUpperCase().includes(mUpper)) return true;
          }
          return false;
        });
        if (!coincide) return false;
      }
      return true;
    });
  });

  readonly mediaItems = signal<MediaRecord[]>([]);
  readonly selectedMediaAssetId = signal("");

  readonly validating = signal(false);
  readonly validationResult = signal<CampaignContactValidationResult | null>(null);
  readonly listaTab = signal<"todos" | "validos" | "invalidos" | "duplicados">("todos");
  filtroNumeros = "";
  readonly saving = signal(false);
  readonly starting = signal(false);
  readonly startingCampaignId = signal<string | null>(null);
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

  readonly campanias = signal<CampaignRecord[]>([]);
  readonly loadingCampanias = signal(false);

  readonly recurrentesJerarquia = signal<RecurringCampaignRecord[]>([]);
  readonly savingRecurring = signal(false);
  readonly busyRecurringIds = signal<Set<string>>(new Set());
  recurringIntervalMinutes = 1440; // Por defecto: Una vez al día (1440 min)
  readonly intervalPresets = [
    { label: "📅 Una vez al día (Cada 24 horas - Recomendado)", minutes: 1440 },
    { label: "Cada 12 horas", minutes: 720 },
    { label: "Cada 6 horas", minutes: 360 },
    { label: "Cada 2 horas", minutes: 120 },
    { label: "Cada hora", minutes: 60 },
    { label: "Cada 30 minutos", minutes: 30 },
  ];

  /* MODAL 1: DESTINATARIOS */
  readonly modalDestinatariosVisible = signal(false);

  /* MODAL 2: DETALLE DE CAMPAÑA */
  readonly modalDetalleCampaniaVisible = signal(false);
  readonly campaniaSeleccionada = signal<CampaignRecord | null>(null);
  readonly loadingDetalleCampania = signal(false);
  readonly mensajesCampania = signal<CampaignMessageRecord[]>([]);
  filtroMensajesCampania = "";

  /* MODAL 3: EDICIÓN DE CAMPAÑA RECURRENTE */
  readonly modalEditarRecurrenteVisible = signal(false);
  readonly itemRecurrenteSeleccionado = signal<RecurringCampaignRecord | null>(null);
  readonly savingEditRecurring = signal(false);
  editRecurrenteName = "";
  editRecurrenteIntervalMinutes = 1440;
  editRecurrenteMessageText = "";
  editRecurrenteMediaAssetId = "";
  editRecurrenteDefaultRegion = "PY";
  readonly editRecurrenteSessionIds = signal<string[]>([]);
  readonly editFiltroEstadosSesion = signal<string[]>([]);
  readonly editFiltroMunicipiosSesion = signal<string[]>([]);

  readonly editSesionesFiltradas = computed<SessionRecord[]>(() => {
    const items = this.sessions();
    const estados = this.editFiltroEstadosSesion();
    const municipios = this.editFiltroMunicipiosSesion();
    return items.filter((session) => {
      if (estados.length > 0 && !estados.includes(session.status)) {
        return false;
      }
      if (municipios.length > 0) {
        const nameUpper = session.name.toUpperCase();
        const coincide = municipios.some((m) => {
          const mUpper = m.toUpperCase();
          if (nameUpper.includes(mUpper)) return true;
          const userMatch = session.name.match(/^u(\d+)/i);
          if (userMatch && this.jerarquia()) {
            const uid = parseInt(userMatch[1], 10);
            const user = [
              ...(this.jerarquia()?.administradores ?? []),
              ...(this.jerarquia()?.gerentes ?? []),
              ...(this.jerarquia()?.movilizadores ?? []),
            ].find((u) => u.idUsuario === uid);
            if (user?.territorio && user.territorio.toUpperCase().includes(mUpper)) return true;
          }
          return false;
        });
        if (!coincide) return false;
      }
      return true;
    });
  });

  readonly mensajesEnProcesoCount = computed(() =>
    this.mensajesCampania().filter((m) => m.status === "PROCESSING" || m.status === "SUBMITTED").length);

  readonly mensajesPendientesCount = computed(() => {
    const c = this.campaniaSeleccionada();
    if (!c) return 0;
    const rem = c.totalMessages - c.sentMessages - c.failedMessages;
    return rem > 0 ? rem : 0;
  });

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

  audienciaLabel(tipo: "PENDIENTE" | "NO_VOTO" | "TODOS" | "CONSULTADO"): string {
    if (tipo === "PENDIENTE") return "Solo sin mensaje enviado (Pendientes)";
    if (tipo === "NO_VOTO") return "Solo a los que todavía NO votaron (Día D)";
    if (tipo === "CONSULTADO") return "Ya consultados (Re-contacto)";
    return "Todos los registrados";
  }

  setFiltroAudiencia(tipo: "PENDIENTE" | "NO_VOTO" | "TODOS" | "CONSULTADO"): void {
    this.filtroAudiencia.set(tipo);
    if (this.totalSeleccionados() > 0) {
      this.cargarPersonas();
    }
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
    const aud = this.filtroAudiencia();
    this.api.voto1x10Contactos({
      territorioIds: this.territorioIds(),
      administradorIds: this.administradorIds(),
      gerenteIds: this.gerenteIds(),
      movilizadorIds: this.movilizadorIds(),
      soloSinMensaje: aud === "PENDIENTE",
      estadoApoyo: aud === "NO_VOTO" ? undefined : aud,
      estadoDiaD: aud === "NO_VOTO" ? "NO_VOTO" : undefined,
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
      next: (result) => {
        this.validating.set(false);
        this.validationResult.set(result);
        this.messages.add({
          severity: "info",
          summary: "Destinatarios validados",
          detail: `${result.sendable} listos para envío (${result.valid} válidos, ${result.duplicates} duplicados, ${result.invalid} inválidos).`,
        });
      },
      error: (error: { error?: { message?: string } }) => {
        this.validating.set(false);
        this.messages.add({ severity: "error", summary: "No se pudo validar", detail: error.error?.message });
      },
    });
  }

  abrirModalDestinatarios(): void {
    this.filtroNumeros = "";
    if (this.validationResult()) {
      this.listaTab.set("validos");
    } else {
      this.listaTab.set("todos");
    }
    this.modalDestinatariosVisible.set(true);
  }

  cerrarModalDestinatarios(): void {
    this.modalDestinatariosVisible.set(false);
  }

  totalContactosCargados(): number {
    return this.contactosResult()?.contacts?.length ?? 0;
  }

  private coincideFiltro(...campos: Array<string | undefined>): boolean {
    const query = this.filtroNumeros.trim().toLowerCase();
    if (!query) return true;
    return campos.some((campo) => (campo ?? "").toLowerCase().includes(query));
  }

  todosContactosFiltrados(): Array<{ name?: string; phone: string }> {
    const contacts = this.contactosResult()?.contacts ?? [];
    return contacts.filter((c) => this.coincideFiltro(c.name, c.phone));
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
    this.startingCampaignId.set(id);
    this.api.startCampaign(id).subscribe({
      next: () => {
        this.starting.set(false);
        this.startingCampaignId.set(null);
        this.messages.add({ severity: "success", summary: "Campaña iniciada con éxito" });
        this.ultimaCampaniaCreada.set(null);
        this.loadCampanias();
        if (this.campaniaSeleccionada()?.id === id) {
          this.recargarMensajesCampaniaSeleccionada();
        }
      },
      error: (error: { error?: { message?: string } }) => {
        this.starting.set(false);
        this.startingCampaignId.set(null);
        this.messages.add({ severity: "error", summary: "No se pudo iniciar", detail: error.error?.message });
      },
    });
  }

  pausarCampania(id: string): void {
    this.api.pauseCampaign(id).subscribe({
      next: () => {
        this.messages.add({ severity: "info", summary: "Campaña pausada" });
        this.loadCampanias();
        if (this.campaniaSeleccionada()?.id === id) {
          this.recargarMensajesCampaniaSeleccionada();
        }
      },
      error: (error: { error?: { message?: string } }) => {
        this.messages.add({ severity: "error", summary: "No se pudo pausar", detail: error.error?.message });
      },
    });
  }

  reanudarCampania(id: string): void {
    this.api.resumeCampaign(id).subscribe({
      next: () => {
        this.messages.add({ severity: "success", summary: "Campaña reanudada" });
        this.loadCampanias();
        if (this.campaniaSeleccionada()?.id === id) {
          this.recargarMensajesCampaniaSeleccionada();
        }
      },
      error: (error: { error?: { message?: string } }) => {
        this.messages.add({ severity: "error", summary: "No se pudo reanudar", detail: error.error?.message });
      },
    });
  }

  cancelarCampania(id: string): void {
    if (!window.confirm("¿Seguro que deseas cancelar esta campaña? Los mensajes no enviados se descartarán.")) return;
    this.api.cancelCampaign(id).subscribe({
      next: () => {
        this.messages.add({ severity: "warn", summary: "Campaña cancelada" });
        this.loadCampanias();
        if (this.campaniaSeleccionada()?.id === id) {
          this.recargarMensajesCampaniaSeleccionada();
        }
      },
      error: (error: { error?: { message?: string } }) => {
        this.messages.add({ severity: "error", summary: "No se pudo cancelar", detail: error.error?.message });
      },
    });
  }

  abrirDetalleCampania(campania: CampaignRecord): void {
    this.campaniaSeleccionada.set(campania);
    this.filtroMensajesCampania = "";
    this.modalDetalleCampaniaVisible.set(true);
    this.recargarMensajesCampaniaSeleccionada();
  }

  abrirDetalleCampaniaPorId(id: string): void {
    const found = this.campanias().find((c) => c.id === id);
    if (found) {
      this.abrirDetalleCampania(found);
    } else {
      this.api.campaigns().subscribe((items) => {
        this.campanias.set(items);
        const item = items.find((c) => c.id === id);
        if (item) this.abrirDetalleCampania(item);
      });
    }
  }

  cerrarModalDetalleCampania(): void {
    this.modalDetalleCampaniaVisible.set(false);
    this.campaniaSeleccionada.set(null);
    this.mensajesCampania.set([]);
  }

  recargarMensajesCampaniaSeleccionada(): void {
    const c = this.campaniaSeleccionada();
    if (!c) return;
    this.loadingDetalleCampania.set(true);
    this.api.campaignMessages(c.id, undefined, 500, 0).subscribe({
      next: (page: CampaignMessagePage) => {
        this.loadingDetalleCampania.set(false);
        this.mensajesCampania.set(page.items ?? []);
        // También actualizar el snapshot de la campaña en la lista
        this.api.campaigns().subscribe((items) => {
          this.campanias.set([...items].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
          const updated = items.find((x) => x.id === c.id);
          if (updated) this.campaniaSeleccionada.set(updated);
        });
      },
      error: () => {
        this.loadingDetalleCampania.set(false);
        this.mensajesCampania.set([]);
      },
    });
  }

  mensajesCampaniaFiltrados(): CampaignMessageRecord[] {
    const msgs = this.mensajesCampania();
    const query = this.filtroMensajesCampania.trim().toLowerCase();
    if (!query) return msgs;
    return msgs.filter((m) =>
      (m.contactName ?? "").toLowerCase().includes(query) ||
      (m.recipientE164 ?? "").includes(query) ||
      (m.recipientRaw ?? "").includes(query) ||
      (m.status ?? "").toLowerCase().includes(query) ||
      (m.lastErrorMessage ?? "").toLowerCase().includes(query),
    );
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

    const aud = this.filtroAudiencia();
    this.savingRecurring.set(true);
    this.api.createRecurringCampaign({
      name: this.name.trim(),
      sourceType: "JERARQUIA",
      jerarquiaSelection: {
        territorioIds: this.territorioIds(),
        administradorIds: this.administradorIds(),
        gerenteIds: this.gerenteIds(),
        movilizadorIds: this.movilizadorIds(),
        soloSinMensaje: aud === "PENDIENTE",
        estadoApoyo: aud === "NO_VOTO" ? undefined : aud,
        estadoDiaD: aud === "NO_VOTO" ? "NO_VOTO" : undefined,
      },
      sessionIds: this.selectedSessionIds(),
      message: { text: this.messageText },
      mediaAssetId: this.selectedMediaAssetId() || undefined,
      defaultRegion: this.defaultRegion.toUpperCase(),
      intervalMinutes: this.recurringIntervalMinutes,
    }).subscribe({
      next: () => {
        this.savingRecurring.set(false);
        this.messages.add({ severity: "success", summary: "Envío recurrente diario guardado con éxito" });
        this.loadRecurrentes();
      },
      error: (error: { error?: { message?: string } }) => {
        this.savingRecurring.set(false);
        this.messages.add({ severity: "error", summary: "No se pudo guardar el envío recurrente", detail: error.error?.message });
      },
    });
  }

  seleccionarTodasConectadas(): void {
    const conectadas = this.sesionesDeSeleccionados().filter((s) => s.status === "CONNECTED").map((s) => s.id);
    const set = new Set([...this.selectedSessionIds(), ...conectadas]);
    this.selectedSessionIds.set(Array.from(set));
  }

  seleccionarTodasVisibles(): void {
    const visibles = this.sesionesDeSeleccionados().map((s) => s.id);
    const set = new Set([...this.selectedSessionIds(), ...visibles]);
    this.selectedSessionIds.set(Array.from(set));
  }

  deseleccionarTodasSesiones(): void {
    this.selectedSessionIds.set([]);
  }

  editSeleccionarTodasConectadas(): void {
    const conectadas = this.editSesionesFiltradas().filter((s) => s.status === "CONNECTED").map((s) => s.id);
    const set = new Set([...this.editRecurrenteSessionIds(), ...conectadas]);
    this.editRecurrenteSessionIds.set(Array.from(set));
  }

  editSeleccionarTodasVisibles(): void {
    const visibles = this.editSesionesFiltradas().map((s) => s.id);
    const set = new Set([...this.editRecurrenteSessionIds(), ...visibles]);
    this.editRecurrenteSessionIds.set(Array.from(set));
  }

  editDeseleccionarTodasSesiones(): void {
    this.editRecurrenteSessionIds.set([]);
  }

  toggleEditSession(id: string): void {
    const current = this.editRecurrenteSessionIds();
    this.editRecurrenteSessionIds.set(current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  getSessionNames(sessionIds: string[]): string {
    if (!sessionIds || sessionIds.length === 0) return "Sin sesiones";
    const found = sessionIds.map((id) => {
      const s = this.sessions().find((x) => x.id === id);
      return s ? s.name : id;
    });
    return found.join(", ");
  }

  abrirModalEditarRecurrente(item: RecurringCampaignRecord): void {
    this.itemRecurrenteSeleccionado.set(item);
    this.editRecurrenteName = item.name;
    this.editRecurrenteIntervalMinutes = item.intervalMinutes;
    this.editRecurrenteMessageText = item.message?.text || "";
    this.editRecurrenteMediaAssetId = item.mediaAssetId || "";
    this.editRecurrenteDefaultRegion = item.defaultRegion || "BO";
    this.editRecurrenteSessionIds.set([...(item.sessionIds || [])]);
    this.editFiltroEstadosSesion.set([]);
    this.editFiltroMunicipiosSesion.set([]);
    this.modalEditarRecurrenteVisible.set(true);
  }

  cerrarModalEditarRecurrente(): void {
    this.modalEditarRecurrenteVisible.set(false);
    this.itemRecurrenteSeleccionado.set(null);
  }

  guardarEdicionRecurrente(): void {
    const item = this.itemRecurrenteSeleccionado();
    if (!item) return;

    if (!this.editRecurrenteName.trim()) {
      this.messages.add({ severity: "warn", summary: "Ingresa un nombre" });
      return;
    }
    if (this.editRecurrenteSessionIds().length === 0) {
      this.messages.add({ severity: "warn", summary: "Selecciona al menos una sesión emisora" });
      return;
    }

    this.savingEditRecurring.set(true);
    this.api.updateRecurringCampaign(item.id, {
      name: this.editRecurrenteName.trim(),
      intervalMinutes: this.editRecurrenteIntervalMinutes,
      sessionIds: this.editRecurrenteSessionIds(),
      message: { text: this.editRecurrenteMessageText },
      mediaAssetId: this.editRecurrenteMediaAssetId || undefined,
      defaultRegion: this.editRecurrenteDefaultRegion.toUpperCase(),
    }).subscribe({
      next: () => {
        this.savingEditRecurring.set(false);
        this.cerrarModalEditarRecurrente();
        this.messages.add({ severity: "success", summary: "Envío recurrente actualizado con éxito" });
        this.loadRecurrentes();
      },
      error: (error: { error?: { message?: string } }) => {
        this.savingEditRecurring.set(false);
        this.messages.add({ severity: "error", summary: "No se pudo actualizar", detail: error.error?.message });
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
