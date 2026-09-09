import { Component, OnInit, inject, signal, computed } from "@angular/core";
import { DatePipe, DecimalPipe } from "@angular/common";
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
 * Envíos por Jerarquía 1x10 con gestión avanzada de campañas:
 * - Selección por Territorio / Administrador / Gerente / Movilizador
 * - Filtro de audiencia (Solo sin mensaje / Pendientes, Todos, Ya consultados, Día D)
 * - Sesiones emisoras con selector visual y estados en tiempo real
 * - Diálogo modal para ver detalle de destinatarios y validación
 * - Diálogo modal para consultar métricas y mensajes de campañas enviadas
 * - Programación de envíos diarios / periódicos a nuevos votantes no contactados
 * - Filtros avanzados por fecha, estado, búsqueda y métricas en campañas enviadas
 */
@Component({
  standalone: true,
  imports: [FormsModule, DatePipe, DecimalPipe, ButtonModule, CardModule, InputTextModule, MultiSelectModule],
  template: `
    <main class="page cj-page">
      <!-- CABECERA PRINCIPAL -->
      <div class="cj-hero-header">
        <div class="hero-text-box">
          <div class="hero-badge">
            <i class="pi pi-sitemap"></i>
            <span>Módulo Electoral 1x10</span>
          </div>
          <h1>Envíos por Jerarquía 1x10</h1>
          <p class="hero-sub">Segmentá territorios, administradores, gerentes y movilizadores con filtros de audiencia, control de pacing anti-bloqueo y gestión de campañas.</p>
        </div>
        <div class="hero-actions">
          <button type="button" class="btn-hero-action" [class.loading]="loadingJerarquia()" (click)="loadJerarquia()" title="Recargar jerarquía">
            <i class="pi pi-refresh" [class.pi-spin]="loadingJerarquia()"></i>
            <span>Recargar datos</span>
          </button>
        </div>
      </div>

      <!-- GRID PRINCIPAL DE CONFIGURACIÓN -->
      <div class="grid two top-grid">
        <!-- 1. SELECCIÓN DE JERARQUÍA Y FILTRO DE AUDIENCIA -->
        <div class="cj-card">
          <div class="card-header-custom">
            <div class="header-icon-pill step-1">
              <span>01</span>
            </div>
            <div class="header-title-box">
              <h2>Elegí a quién y filtro de audiencia</h2>
              <span class="header-desc">Selecciona los niveles de la estructura del padrón a contactar</span>
            </div>
          </div>

          <div class="card-body-custom">
            @if (loadingJerarquia()) {
              <div class="loading-box">
                <i class="pi pi-spin pi-spinner"></i>
                <span>Cargando estructura del padrón 1x10…</span>
              </div>
            } @else if (!jerarquia()) {
              <div class="error-alert">
                <i class="pi pi-exclamation-triangle"></i>
                <span>No se pudo cargar la estructura de 1x10. Reintentá más tarde.</span>
              </div>
            } @else {
              <div class="hierarchy-filters">
                <!-- TERRITORIO -->
                <div class="filter-field">
                  <div class="filter-label-row">
                    <label><i class="pi pi-map-marker"></i> Territorio</label>
                    <span class="count-pill">{{ jerarquia()!.territorios.length }} disponibles</span>
                  </div>
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
                    placeholder="Todos los territorios (sin filtrar)"
                    [showClear]="true"
                    styleClass="w-full cj-multiselect"
                  />
                </div>

                <!-- ADMINISTRADOR -->
                <div class="filter-field">
                  <div class="filter-label-row">
                    <label><i class="pi pi-user"></i> Administrador</label>
                    <span class="count-pill">{{ jerarquia()!.administradores.length }} disponibles</span>
                  </div>
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
                    placeholder="Todos los administradores (sin filtrar)"
                    [showClear]="true"
                    styleClass="w-full cj-multiselect"
                  />
                </div>

                <!-- GERENTE -->
                <div class="filter-field">
                  <div class="filter-label-row">
                    <label><i class="pi pi-id-card"></i> Gerente</label>
                    <span class="count-pill">{{ gerenteOptions().length }}{{ administradorIds().length ? ' de sus administradores' : ' disponibles' }}</span>
                  </div>
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
                    placeholder="Todos los gerentes (sin filtrar)"
                    [showClear]="true"
                    styleClass="w-full cj-multiselect"
                  />
                </div>

                <!-- MOVILIZADOR -->
                <div class="filter-field">
                  <div class="filter-label-row">
                    <label><i class="pi pi-users"></i> Movilizador</label>
                    <span class="count-pill">{{ movilizadorOptions().length }}{{ (gerenteIds().length || territorioIds().length) ? ' de lo elegido' : ' disponibles' }}</span>
                  </div>
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
                    placeholder="Todos los movilizadores (sin filtrar)"
                    [showClear]="true"
                    styleClass="w-full cj-multiselect"
                  />
                </div>

                <!-- FILTRO DE AUDIENCIA / ESTADO -->
                <div class="audience-section">
                  <div class="audience-section-title">
                    <i class="pi pi-filter-fill"></i>
                    <span>Filtro de audiencia en la jerarquía</span>
                  </div>
                  
                  <div class="audience-grid">
                    <div
                      class="audience-card"
                      [class.active]="filtroAudiencia() === 'PENDIENTE'"
                      (click)="setFiltroAudiencia('PENDIENTE')"
                    >
                      <div class="card-radio-dot">
                        <div class="dot-inner"></div>
                      </div>
                      <div class="audience-info">
                        <span class="audience-badge badge-green">🟢 Pendientes</span>
                        <div class="audience-name">Solo sin mensaje enviado</div>
                        <div class="audience-desc">Personas a las que aún no se les ha enviado ningún WhatsApp.</div>
                      </div>
                    </div>

                    <div
                      class="audience-card"
                      [class.active]="filtroAudiencia() === 'NO_VOTO'"
                      (click)="setFiltroAudiencia('NO_VOTO')"
                    >
                      <div class="card-radio-dot">
                        <div class="dot-inner"></div>
                      </div>
                      <div class="audience-info">
                        <span class="audience-badge badge-amber">🗳️ Día D</span>
                        <div class="audience-name">Aún NO votaron</div>
                        <div class="audience-desc">Personas registradas que todavía no han votado en el Día D.</div>
                      </div>
                    </div>

                    <div
                      class="audience-card"
                      [class.active]="filtroAudiencia() === 'TODOS'"
                      (click)="setFiltroAudiencia('TODOS')"
                    >
                      <div class="card-radio-dot">
                        <div class="dot-inner"></div>
                      </div>
                      <div class="audience-info">
                        <span class="audience-badge badge-blue">👥 Todos</span>
                        <div class="audience-name">Padrón completo</div>
                        <div class="audience-desc">Incluye a todas las personas sin importar su estado previo.</div>
                      </div>
                    </div>

                    <div
                      class="audience-card"
                      [class.active]="filtroAudiencia() === 'CONSULTADO'"
                      (click)="setFiltroAudiencia('CONSULTADO')"
                    >
                      <div class="card-radio-dot">
                        <div class="dot-inner"></div>
                      </div>
                      <div class="audience-info">
                        <span class="audience-badge badge-purple">📢 Re-contacto</span>
                        <div class="audience-name">Ya consultados</div>
                        <div class="audience-desc">Personas que ya recibieron mensaje y están en estado CONSULTADO.</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- BARRA DE ACCIÓN PARA CARGAR PERSONAS -->
              <div class="selection-footer-bar">
                <div class="selection-status-badge">
                  <i class="pi pi-check-circle"></i>
                  <span><strong>{{ totalSeleccionados() }}</strong> nivel(es) seleccionado(s)</span>
                </div>
                <div class="selection-buttons">
                  <button type="button" class="btn-secondary-custom" [disabled]="totalSeleccionados() === 0" (click)="limpiarSeleccion()">
                    <i class="pi pi-trash"></i> Limpiar
                  </button>
                  <button type="button" class="btn-primary-custom" [disabled]="totalSeleccionados() === 0 || loadingContactos()" (click)="cargarPersonas()">
                    <i class="pi" [class.pi-users]="!loadingContactos()" [class.pi-spin]="loadingContactos()" [class.pi-spinner]="loadingContactos()"></i>
                    <span>{{ loadingContactos() ? 'Buscando...' : 'Cargar personas' }}</span>
                  </button>
                </div>
              </div>
            }

            <!-- RESUMEN DE CONTACTOS CARGADOS -->
            @if (contactosResult(); as resultado) {
              <div class="contactos-results-card">
                <div class="results-header">
                  <span><i class="pi pi-database"></i> Resultados encontrados para este filtro:</span>
                </div>
                <div class="kpi-micro-grid">
                  <div class="kpi-box">
                    <span class="kpi-num">{{ resultado.movilizadorCount }}</span>
                    <span class="kpi-tag"><i class="pi pi-users"></i> Movilizadores</span>
                  </div>
                  <div class="kpi-box">
                    <span class="kpi-num">{{ resultado.personaCount }}</span>
                    <span class="kpi-tag"><i class="pi pi-id-card"></i> Padrón total</span>
                  </div>
                  <div class="kpi-box highlight-box">
                    <span class="kpi-num">{{ resultado.contacts.length }}</span>
                    <span class="kpi-tag"><i class="pi pi-whatsapp"></i> Celulares únicos listos</span>
                  </div>
                </div>

                <div class="destinatarios-modal-banner">
                  <div class="banner-text">
                    <i class="pi pi-info-circle"></i>
                    <span>Destinatarios listos para validación y despacho.</span>
                  </div>
                  <button type="button" class="btn-modal-open" (click)="abrirModalDestinatarios()">
                    <i class="pi pi-eye"></i> Ver lista completa
                  </button>
                </div>

                @if (resultado.contacts.length === 0) {
                  <div class="alert-empty">
                    <i class="pi pi-info-circle"></i>
                    <span>Ninguno de los seleccionados tiene personas con número de celular cargado para este filtro.</span>
                  </div>
                }
              </div>
            }
          </div>
        </div>

        <!-- 2. MENSAJE Y CONFIGURACIÓN DE ENVÍO -->
        <div class="cj-card">
          <div class="card-header-custom">
            <div class="header-icon-pill step-2">
              <span>02</span>
            </div>
            <div class="header-title-box">
              <h2>Mensaje y envío</h2>
              <span class="header-desc">Configurá el contenido, sesiones emisoras y control de distribución</span>
            </div>
          </div>

          <div class="card-body-custom">
            <form class="form-grid" (ngSubmit)="crearCampania()">
              <!-- NOMBRE DE LA CAMPAÑA -->
              <div class="form-group">
                <label for="cj-name"><i class="pi pi-tag"></i> Nombre de la campaña</label>
                <input
                  pInputText
                  id="cj-name"
                  name="cjName"
                  [(ngModel)]="name"
                  placeholder="Ej: Invitación Compromiso 1x10 - San Roque"
                  class="cj-input w-full"
                />
              </div>

              <!-- SESIONES EMISORAS -->
              <div class="form-group">
                <div class="session-header-row">
                  <label><i class="pi pi-whatsapp"></i> Sesiones emisoras de WhatsApp</label>
                  <span class="session-selected-count">{{ selectedSessionIds().length }} de {{ sesionesDeSeleccionados().length }} elegida(s)</span>
                </div>

                <!-- TOOLBAR DE SESIONES -->
                <div class="session-toolbar-box">
                  <div class="session-toggle-pills">
                    <button type="button" class="tab-pill" [class.active]="!mostrarTodasLasSesiones()" (click)="mostrarTodasLasSesiones.set(false)">
                      De los elegidos arriba @if (haySeleccionJerarquica()) { ({{ sesionesDeElegidosCount() }}) }
                    </button>
                    <button type="button" class="tab-pill" [class.active]="mostrarTodasLasSesiones()" (click)="mostrarTodasLasSesiones.set(true)">
                      Todas las sesiones ({{ sessions().length }})
                    </button>
                  </div>

                  <div class="session-filters-row">
                    <p-multiSelect
                      [options]="estadosDisponibles()"
                      [ngModel]="filtroEstadosSesion()"
                      (ngModelChange)="filtroEstadosSesion.set($event)"
                      optionLabel="label"
                      optionValue="value"
                      placeholder="Filtrar por estado..."
                      [showClear]="true"
                      display="chip"
                      [maxSelectedLabels]="1"
                      styleClass="cj-multiselect-mini"
                    />
                    <p-multiSelect
                      [options]="municipioOptions()"
                      [ngModel]="filtroMunicipiosSesion()"
                      (ngModelChange)="filtroMunicipiosSesion.set($event)"
                      optionLabel="label"
                      optionValue="value"
                      placeholder="Filtrar por municipio..."
                      [showClear]="true"
                      display="chip"
                      [maxSelectedLabels]="1"
                      filter="true"
                      filterPlaceHolder="Buscar..."
                      styleClass="cj-multiselect-mini"
                    />
                  </div>

                  <div class="session-quick-actions">
                    <button type="button" class="btn-micro" (click)="seleccionarTodasConectadas()"><i class="pi pi-check"></i> Conectadas</button>
                    <button type="button" class="btn-micro" (click)="seleccionarTodasVisibles()"><i class="pi pi-check-square"></i> Marcar visibles</button>
                    <button type="button" class="btn-micro btn-micro-clear" (click)="deseleccionarTodasSesiones()"><i class="pi pi-times"></i> Limpiar</button>
                  </div>
                </div>

                @if (!mostrarTodasLasSesiones() && haySeleccionJerarquica() && sesionesDeElegidosCount() === 0) {
                  <div class="session-notice">
                    <i class="pi pi-info-circle"></i>
                    <span>Ninguno de los elegidos arriba tiene una sesión de WhatsApp propia asociada. Hacé clic en <strong>"Todas las sesiones"</strong> para usar las sesiones generales disponibles.</span>
                  </div>
                }

                <!-- LISTA DE SESIONES -->
                <div class="session-cards-container">
                  @for (session of sesionesDeSeleccionados(); track session.id) {
                    <div
                      class="session-item-card"
                      [class.selected]="selectedSessionIds().includes(session.id)"
                      (click)="toggleSession(session.id)"
                    >
                      <input
                        type="checkbox"
                        [checked]="selectedSessionIds().includes(session.id)"
                        (click)="$event.stopPropagation()"
                        (change)="toggleSession(session.id)"
                      />
                      <div class="session-info-content">
                        <span class="session-card-name">{{ session.name }}</span>
                        <div class="session-card-meta">
                          @if (session.phoneE164) {
                            <code class="session-phone">{{ session.phoneE164 }}</code>
                          }
                          <span class="session-status-badge" [class.connected]="session.status === 'CONNECTED'" [class.quarantined]="session.status === 'QUARANTINED'">
                            <span class="status-dot"></span>
                            {{ sessionStatusLabel(session.status) }}
                          </span>
                        </div>
                      </div>
                    </div>
                  } @empty {
                    <div class="empty-sessions-box">
                      <i class="pi pi-inbox"></i>
                      <span>No hay sesiones que coincidan con los filtros seleccionados.</span>
                    </div>
                  }
                </div>
              </div>

              <!-- CUERPO DEL MENSAJE -->
              <div class="form-group">
                <div class="msg-header-row">
                  <label for="cj-message"><i class="pi pi-comment"></i> Texto del mensaje</label>
                  <div class="variable-chips">
                    <span class="var-title">Insertar variable:</span>
                    <button type="button" class="chip-tag" (click)="insertarVariable('nombre')" title="Nombre del destinatario">+ {{ '{{nombre}}' }}</button>
                    <button type="button" class="chip-tag" (click)="insertarVariable('nombre_votante')" title="Nombre completo">+ {{ '{{nombre_votante}}' }}</button>
                  </div>
                </div>

                <textarea
                  id="cj-message"
                  name="cjMessage"
                  rows="4"
                  [(ngModel)]="messageText"
                  (ngModelChange)="onMessageTextChange()"
                  placeholder="{Hola|Buenas|Qué tal} {{ '{{nombre}}' }}, te escribimos del equipo de 1x10..."
                  class="cj-textarea w-full"
                ></textarea>

                <div class="spintax-helper-box">
                  <i class="pi pi-shield"></i>
                  <span><strong>Spintax anti-bloqueo:</strong> Alterna saludos como <code>&#123;Hola|Buenas|Qué tal&#125;</code> para que cada mensaje sea único y WhatsApp no detecte envíos masivos.</span>
                </div>

                @if (tieneSpintax()) {
                  <div class="spintax-live-card">
                    <div class="spintax-live-header">
                      <span><i class="pi pi-sparkles"></i> Vista previa de variación aleatoria:</span>
                      <button type="button" class="btn-micro" (click)="generarEjemploSpintax()">
                        <i class="pi pi-refresh"></i> Probar otra
                      </button>
                    </div>
                    <div class="spintax-live-quote">"{{ ejemploSpintax() }}"</div>
                  </div>
                }
              </div>

              <!-- MULTIMEDIA & REGIÓN EN 2 COLUMNAS -->
              <div class="form-two-cols">
                <div class="form-group">
                  <label for="cj-media"><i class="pi pi-image"></i> Multimedia adjunta (opcional)</label>
                  <select id="cj-media" name="cjMedia" [(ngModel)]="selectedMediaAssetId" class="cj-select w-full">
                    <option value="">Sin multimedia (solo texto)</option>
                    @for (item of mediaItems(); track item.id) {
                      <option [value]="item.id">{{ item.fileName }} ({{ item.mediaKind || item.mimeType }})</option>
                    }
                  </select>
                </div>

                <div class="form-group">
                  <label for="cj-region"><i class="pi pi-globe"></i> País / Región por defecto</label>
                  <select id="cj-region" name="cjRegion" [(ngModel)]="defaultRegion" (ngModelChange)="validationResult.set(null)" class="cj-select w-full">
                    @for (region of regionOptions; track region.code) {
                      <option [value]="region.code">{{ region.label }}</option>
                    }
                  </select>
                </div>
              </div>

              <!-- LÍMITE MÁXIMO DIARIO (PACING) -->
              <div class="form-group daily-limit-box">
                <div class="daily-limit-header">
                  <label for="cj-daily-limit"><i class="pi pi-hourglass"></i> Límite máx. de envíos diarios por chip / WhatsApp</label>
                  <span class="sub-tip">Pacing anti-bloqueo</span>
                </div>
                <input
                  pInputText
                  type="number"
                  min="1"
                  max="5000"
                  id="cj-daily-limit"
                  name="cjDailyLimit"
                  [(ngModel)]="maxDailyMessagesPerSession"
                  placeholder="Ej: 20 (dejar vacío para enviar todo de inmediato)"
                  class="cj-input w-full"
                />
                @if (tieneLimiteDiarioActivo()) {
                  <div class="pacing-live-banner">
                    <i class="pi pi-check-circle"></i>
                    <div>
                      <strong>Pacing activo:</strong> Con {{ selectedSessionIds().length }} sesión(es) a máx {{ maxDailyMessagesPerSession }} msgs/día c/u =
                      hasta <strong>{{ calcularMensajesPorDia() }}</strong> msgs/día. La campaña se distribuirá automáticamente en <strong>{{ calcularDiasDistribucion() }}</strong> día(s).
                    </div>
                  </div>
                }
              </div>

              <!-- VALIDACIÓN DE DESTINATARIOS -->
              <div class="validation-bar-box">
                <button type="button" class="btn-validate" [disabled]="!contactosResult()?.contacts?.length || validating()" (click)="validar()">
                  <i class="pi" [class.pi-check-circle]="!validating()" [class.pi-spin]="validating()" [class.pi-spinner]="validating()"></i>
                  <span>{{ validating() ? 'Validando...' : 'Validar números' }}</span>
                </button>
                @if (validationResult(); as val) {
                  <div class="val-pills-row">
                    <span class="val-tag ok">✅ {{ val.valid }} válidos</span>
                    @if (val.invalid > 0) { <span class="val-tag bad">⚠️ {{ val.invalid }} inválidos</span> }
                    @if (val.duplicates > 0) { <span class="val-tag dup">🔄 {{ val.duplicates }} duplicados</span> }
                    <button type="button" class="btn-micro" (click)="abrirModalDestinatarios()">
                      <i class="pi pi-external-link"></i> Ver detalle
                    </button>
                  </div>
                }
              </div>

              <!-- AUTORIZACIÓN LEGAL -->
              <label class="consent-check-card">
                <input type="checkbox" [(ngModel)]="consentConfirmed" name="cjConsent" />
                <span>Confirmo que estos destinatarios forman parte del padrón autorizado del sistema 1x10.</span>
              </label>

              <!-- SUBMIT BOTÓN -->
              <button
                type="submit"
                class="btn-submit-campaign"
                [disabled]="saving() || !contactosResult()?.contacts?.length"
              >
                <i class="pi" [class.pi-send]="!saving()" [class.pi-spin]="saving()" [class.pi-spinner]="saving()"></i>
                <span>{{ saving() ? 'Creando campaña...' : 'Crear campaña' }}</span>
              </button>
            </form>

            @if (ultimaCampaniaCreada(); as campania) {
              <div class="created-campaign-card">
                <div class="created-card-top">
                  <i class="pi pi-check-circle"></i>
                  <div>
                    <strong>Campaña "{{ campania.name }}" creada en borrador</strong>
                    <span>Total de {{ campania.totalMessages }} destinatario(s) preparados.</span>
                  </div>
                </div>
                <div class="created-card-actions">
                  <button type="button" class="btn-action-green" [disabled]="starting()" (click)="iniciarCampania(campania.id)">
                    <i class="pi" [class.pi-play]="!starting()" [class.pi-spin]="starting()" [class.pi-spinner]="starting()"></i>
                    <span>Iniciar envíos ahora</span>
                  </button>
                  <button type="button" class="btn-action-outline" (click)="abrirDetalleCampaniaPorId(campania.id)">
                    <i class="pi pi-eye"></i> Ver detalle
                  </button>
                </div>
              </div>
            }
          </div>
        </div>
      </div>

      <!-- 3. ENVÍOS DIARIOS / PROGRAMACIÓN AUTOMÁTICA -->
      <div class="cj-card recurring-section-card">
        <div class="card-header-custom">
          <div class="header-icon-pill step-3">
            <span>03</span>
          </div>
          <div class="header-title-box">
            <h2>Envíos diarios y automáticos a nuevos no consultados</h2>
            <span class="header-desc">Automatizá la prospección: el sistema despacha periódicamente solo a las personas que ingresen en estado PENDIENTE</span>
          </div>
        </div>

        <div class="card-body-custom">
          <div class="recurring-config-row">
            <div class="rec-field">
              <label for="cj-rec-interval"><i class="pi pi-clock"></i> Frecuencia de escaneo y envío automático</label>
              <select id="cj-rec-interval" name="cjRecInterval" [(ngModel)]="recurringIntervalMinutes" class="cj-select">
                @for (preset of intervalPresets; track preset.minutes) {
                  <option [value]="preset.minutes">{{ preset.label }}</option>
                }
              </select>
            </div>

            <button
              type="button"
              class="btn-save-recurring"
              [disabled]="totalSeleccionados() === 0 || !name.trim() || selectedSessionIds().length === 0 || savingRecurring()"
              (click)="crearRecurrente()"
            >
              <i class="pi" [class.pi-calendar-plus]="!savingRecurring()" [class.pi-spin]="savingRecurring()" [class.pi-spinner]="savingRecurring()"></i>
              <span>Guardar envío diario / automático</span>
            </button>
          </div>

          <div class="recurring-help-note">
            <i class="pi pi-info-circle"></i>
            <span>Toma la configuración actual (nombre, sesiones, mensaje, multimedia y jerarquía con filtro) para correr en segundo plano.</span>
          </div>

          @if (recurrentesJerarquia().length > 0) {
            <div class="table-responsive-box mt-3">
              <table class="cj-table">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Frecuencia</th>
                    <th>Sesiones</th>
                    <th>Estado</th>
                    <th>Última corrida</th>
                    <th>Resultado</th>
                    <th style="min-width: 130px;">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  @for (item of recurrentesJerarquia(); track item.id) {
                    <tr>
                      <td><strong>{{ item.name }}</strong></td>
                      <td>{{ intervalLabel(item.intervalMinutes) }}</td>
                      <td>
                        <span class="session-pill-tag" [title]="getSessionNames(item.sessionIds)">
                          {{ item.sessionIds.length }} sesión(es)
                        </span>
                      </td>
                      <td>
                        <span class="status-badge" [class.active-st]="item.status === 'ACTIVE'" [class.paused-st]="item.status === 'PAUSED'">
                          {{ item.status === 'ACTIVE' ? 'Activo' : 'Pausado' }}
                        </span>
                      </td>
                      <td>{{ item.lastRunAt ? (item.lastRunAt | date:'short') : 'Todavía no corrió' }}</td>
                      <td>
                        @if (item.lastRunOutcome) {
                          <span class="outcome-tag" [class]="item.lastRunOutcome.toLowerCase()">{{ outcomeLabel(item) }}</span>
                        } @else {
                          <span class="muted">—</span>
                        }
                      </td>
                      <td class="table-actions">
                        <button type="button" class="btn-tbl-action" (click)="abrirModalEditarRecurrente(item)" title="Editar">
                          <i class="pi pi-pencil"></i>
                        </button>
                        @if (item.status === 'ACTIVE') {
                          <button type="button" class="btn-tbl-action warn" [disabled]="busyRecurringIds().has(item.id)" (click)="pausarRecurrente(item)" title="Pausar">
                            <i class="pi pi-pause"></i>
                          </button>
                        } @else {
                          <button type="button" class="btn-tbl-action success" [disabled]="busyRecurringIds().has(item.id)" (click)="reanudarRecurrente(item)" title="Reanudar">
                            <i class="pi pi-play"></i>
                          </button>
                        }
                        <button type="button" class="btn-tbl-action danger" [disabled]="busyRecurringIds().has(item.id)" (click)="eliminarRecurrente(item)" title="Eliminar">
                          <i class="pi pi-trash"></i>
                        </button>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          } @else {
            <div class="empty-state-card">
              <i class="pi pi-calendar"></i>
              <span>Todavía no tenés ningún envío recurrente automático configurado.</span>
            </div>
          }
        </div>
      </div>

      <!-- 4. CONSULTA Y GESTIÓN DE CAMPAÑAS ENVIADAS (CON FILTROS AVANZADOS) -->
      <div class="cj-card campaigns-list-card">
        <div class="card-header-custom header-with-actions">
          <div class="header-left-flex">
            <div class="header-icon-pill step-4">
              <span>04</span>
            </div>
            <div class="header-title-box">
              <h2>Campañas enviadas y en curso</h2>
              <span class="header-desc">Supervisá el estado en tiempo real, métricas de entrega, filtros por fecha y control de envíos</span>
            </div>
          </div>
          <button type="button" class="btn-refresh-pill" [disabled]="loadingCampanias()" (click)="loadCampanias()">
            <i class="pi pi-refresh" [class.pi-spin]="loadingCampanias()"></i>
            <span>Actualizar lista</span>
          </button>
        </div>

        <div class="card-body-custom">
          <!-- BARRA DE FILTROS SUPERIOR -->
          <div class="campaign-filters-panel">
            <div class="filter-controls-grid">
              <!-- BÚSQUEDA POR TEXTO -->
              <div class="ctrl-item search-ctrl">
                <label><i class="pi pi-search"></i> Buscar campaña</label>
                <div class="input-with-icon">
                  <i class="pi pi-search"></i>
                  <input
                    pInputText
                    type="text"
                    placeholder="Nombre, territorio o jerarquía..."
                    [ngModel]="filtroCampaniaTexto()"
                    (ngModelChange)="onSearchTextChange($event)"
                    class="cj-input w-full"
                  />
                  @if (filtroCampaniaTexto()) {
                    <button type="button" class="clear-input-btn" (click)="onSearchTextChange('')"><i class="pi pi-times"></i></button>
                  }
                </div>
              </div>

              <!-- FILTRO POR ESTADO -->
              <div class="ctrl-item">
                <label><i class="pi pi-filter"></i> Estado</label>
                <select [ngModel]="filtroCampaniaEstado()" (ngModelChange)="onEstadoChange($event)" class="cj-select w-full">
                  <option value="TODOS">Todos los estados</option>
                  <option value="RUNNING">⚡ En ejecución (RUNNING)</option>
                  <option value="COMPLETED">✅ Completada (COMPLETED)</option>
                  <option value="COMPLETED_ALL">✅ Completadas (Incluye con errores)</option>
                  <option value="PAUSED">⏸️ Pausada (PAUSED)</option>
                  <option value="DRAFT">📝 Borrador (DRAFT)</option>
                  <option value="CANCELLED">🛑 Cancelada (CANCELLED)</option>
                </select>
              </div>

              <!-- FILTRO RÁPIDO DE FECHAS (PRESETS) -->
              <div class="ctrl-item presets-ctrl">
                <label><i class="pi pi-calendar"></i> Período rápido</label>
                <div class="preset-buttons-row">
                  <button type="button" class="btn-preset" [class.active]="filtroCampaniaPreset() === 'TODAS'" (click)="aplicarPresetFecha('TODAS')">Todas</button>
                  <button type="button" class="btn-preset" [class.active]="filtroCampaniaPreset() === 'HOY'" (click)="aplicarPresetFecha('HOY')">Hoy</button>
                  <button type="button" class="btn-preset" [class.active]="filtroCampaniaPreset() === 'AYER'" (click)="aplicarPresetFecha('AYER')">Ayer</button>
                  <button type="button" class="btn-preset" [class.active]="filtroCampaniaPreset() === '7_DIAS'" (click)="aplicarPresetFecha('7_DIAS')">Últimos 7 días</button>
                  <button type="button" class="btn-preset" [class.active]="filtroCampaniaPreset() === 'ESTE_MES'" (click)="aplicarPresetFecha('ESTE_MES')">Este mes</button>
                </div>
              </div>

              <!-- FECHA DESDE Y HASTA -->
              <div class="ctrl-item date-range-ctrl">
                <label><i class="pi pi-calendar-plus"></i> Rango exacto de fechas</label>
                <div class="date-inputs-row">
                  <div class="date-sub">
                    <span>Desde:</span>
                    <input type="date" [ngModel]="filtroCampaniaFechaDesde()" (ngModelChange)="onFechaDesdeChange($event)" class="cj-input-date" />
                  </div>
                  <div class="date-sub">
                    <span>Hasta:</span>
                    <input type="date" [ngModel]="filtroCampaniaFechaHasta()" (ngModelChange)="onFechaHastaChange($event)" class="cj-input-date" />
                  </div>
                </div>
              </div>

              <!-- ORDENAR POR -->
              <div class="ctrl-item">
                <label><i class="pi pi-sort-alt"></i> Ordenar por</label>
                <select [ngModel]="ordenCampanias()" (ngModelChange)="ordenCampanias.set($event)" class="cj-select w-full">
                  <option value="RECIENTES">Más recientes primero</option>
                  <option value="ANTIGUAS">Más antiguas primero</option>
                  <option value="MAS_DESTINATARIOS">Mayor cant. destinatarios</option>
                  <option value="MAS_ENVIADOS">Mayor cant. enviados</option>
                  <option value="NOMBRE">Nombre alfabético</option>
                </select>
              </div>

              <!-- BOTÓN LIMPIAR FILTROS -->
              <div class="ctrl-item reset-ctrl">
                <button type="button" class="btn-reset-filters" (click)="limpiarFiltrosCampanias()" title="Restablecer todos los filtros">
                  <i class="pi pi-filter-slash"></i> Limpiar filtros
                </button>
              </div>
            </div>

            <!-- RESUMEN DE MÉTRICAS GLOBALES DE LAS CAMPAÑAS FILTRADAS -->
            <div class="campaign-kpis-summary-bar">
              <div class="kpi-sum-item">
                <span class="sum-label">Campañas</span>
                <strong class="sum-value">{{ kpisCampaniasFiltradas().totalCampanias }}</strong>
              </div>
              <div class="kpi-sum-item">
                <span class="sum-label">Total Destinatarios</span>
                <strong class="sum-value">{{ kpisCampaniasFiltradas().totalDestinatarios | number }}</strong>
              </div>
              <div class="kpi-sum-item ok">
                <span class="sum-label">Enviados</span>
                <strong class="sum-value">{{ kpisCampaniasFiltradas().totalEnviados | number }}</strong>
              </div>
              <div class="kpi-sum-item fail">
                <span class="sum-label">Fallidos</span>
                <strong class="sum-value">{{ kpisCampaniasFiltradas().totalFallidos | number }}</strong>
              </div>
              <div class="kpi-sum-item highlight">
                <span class="sum-label">Efectividad</span>
                <strong class="sum-value">{{ kpisCampaniasFiltradas().porcentajeExito }}%</strong>
              </div>
            </div>
          </div>

          <!-- TABLA DE CAMPAÑAS -->
          @if (loadingCampanias()) {
            <div class="loading-box">
              <i class="pi pi-spin pi-spinner"></i>
              <span>Cargando campañas...</span>
            </div>
          } @else if (campaniasFiltradas().length === 0) {
            <div class="empty-state-card">
              <i class="pi pi-filter-slash"></i>
              <span>No hay campañas que coincidan con los filtros aplicados.</span>
              <button type="button" class="btn-micro mt-2" (click)="limpiarFiltrosCampanias()">Restablecer filtros</button>
            </div>
          } @else {
            <div class="table-responsive-box">
              <table class="cj-table campaigns-table">
                <thead>
                  <tr>
                    <th>Nombre de Campaña</th>
                    <th>Jerarquía / Destino</th>
                    <th>Estado</th>
                    <th>Progreso y Envíos</th>
                    <th>Fecha de Creación</th>
                    <th style="min-width: 170px;">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  @for (campania of campaniasPaginadas(); track campania.id) {
                    <tr class="campaign-row">
                      <td class="col-name">
                        <div class="camp-title-box">
                          <span class="camp-name">{{ campania.name }}</span>
                          <span class="camp-id">ID: {{ campania.id.slice(0, 8) }}</span>
                        </div>
                      </td>
                      <td class="col-jerarquia">
                        @if (campania.jerarquiaResumen) {
                          <span class="jerarquia-tag-badge" [title]="campania.jerarquiaResumen">{{ campania.jerarquiaResumen }}</span>
                        } @else {
                          <span class="muted-small">General (sin jerarquía)</span>
                        }
                      </td>
                      <td class="col-status">
                        <span
                          class="status-pill-badge"
                          [class.st-running]="campania.status === 'RUNNING'"
                          [class.st-completed]="campania.status === 'COMPLETED'"
                          [class.st-paused]="campania.status === 'PAUSED' || campania.status === 'PAUSED_BY_CIRCUIT_BREAKER'"
                          [class.st-draft]="campania.status === 'DRAFT' || campania.status === 'PREPARING'"
                          [class.st-failed]="campania.status === 'COMPLETED_WITH_ERRORS' || campania.status === 'CANCELLED'"
                        >
                          <span class="status-pulse-dot"></span>
                          {{ campaignStatusLabel(campania.status) }}
                        </span>
                      </td>
                      <td class="col-progress">
                        <div class="progress-container">
                          <div class="progress-labels">
                            <span class="sent-count"><strong>{{ campania.sentMessages }}</strong> / {{ campania.totalMessages }}</span>
                            <span class="percent-label">{{ porcentajeProgreso(campania) }}%</span>
                          </div>
                          <div class="progress-bar-track">
                            <div class="progress-bar-fill" [style.width.%]="porcentajeProgreso(campania)" [class.complete]="campania.status === 'COMPLETED'"></div>
                          </div>
                          @if (campania.failedMessages > 0) {
                            <span class="failed-count-note"><i class="pi pi-times-circle"></i> {{ campania.failedMessages }} fallido(s)</span>
                          }
                        </div>
                      </td>
                      <td class="col-date">
                        <div class="date-cell">
                          <span class="date-main">{{ campania.createdAt | date:'d/MM/yyyy' }}</span>
                          <span class="date-time">{{ campania.createdAt | date:'HH:mm:ss' }}</span>
                        </div>
                      </td>
                      <td class="col-actions">
                        <div class="table-actions-row">
                          @if (campania.status === 'DRAFT') {
                            <button type="button" class="btn-action-start" [disabled]="startingCampaignId() === campania.id" (click)="iniciarCampania(campania.id)">
                              <i class="pi" [class.pi-play]="startingCampaignId() !== campania.id" [class.pi-spin]="startingCampaignId() === campania.id" [class.pi-spinner]="startingCampaignId() === campania.id"></i>
                              <span>Iniciar</span>
                            </button>
                          } @else if (campania.status === 'RUNNING') {
                            <button type="button" class="btn-tbl-action warn" (click)="pausarCampania(campania.id)" title="Pausar envío">
                              <i class="pi pi-pause"></i>
                            </button>
                          } @else if (campania.status === 'PAUSED') {
                            <button type="button" class="btn-tbl-action success" (click)="reanudarCampania(campania.id)" title="Reanudar envío">
                              <i class="pi pi-play"></i>
                            </button>
                          }

                          @if (campania.status === 'RUNNING' || campania.status === 'PAUSED') {
                            <button type="button" class="btn-tbl-action danger" (click)="cancelarCampania(campania.id)" title="Cancelar campaña">
                              <i class="pi pi-times"></i>
                            </button>
                          }

                          <button type="button" class="btn-tbl-action info" (click)="abrirDetalleCampania(campania)" title="Ver métricas y mensajes">
                            <i class="pi pi-eye"></i>
                            <span class="btn-text">Detalle</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>

            <!-- PAGINACIÓN Y CONTROL DE FILAS -->
            <div class="pagination-footer-bar">
              <div class="page-size-selector">
                <span>Filas por página:</span>
                <select [ngModel]="filasPorPagina()" (ngModelChange)="onFilasPorPaginaChange($event)" class="cj-select-mini">
                  <option [value]="10">10</option>
                  <option [value]="25">25</option>
                  <option [value]="50">50</option>
                  <option [value]="9999">Todas</option>
                </select>
                <span class="total-count-text">Mostrando {{ campaniasPaginadas().length }} de {{ campaniasFiltradas().length }} campaña(s)</span>
              </div>

              @if (totalPaginasCampanias() > 1) {
                <div class="pagination-controls">
                  <button type="button" class="btn-page" [disabled]="paginaActual() === 1" (click)="cambiarPagina(-1)">
                    <i class="pi pi-chevron-left"></i> Anterior
                  </button>
                  <span class="page-indicator">Página {{ paginaActual() }} de {{ totalPaginasCampanias() }}</span>
                  <button type="button" class="btn-page" [disabled]="paginaActual() === totalPaginasCampanias()" (click)="cambiarPagina(1)">
                    Siguiente <i class="pi pi-chevron-right"></i>
                  </button>
                </div>
              }
            </div>
          }
        </div>
      </div>
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
                <span class="status-pill-badge" [class.st-running]="campaniaSeleccionada()?.status === 'RUNNING'" [class.st-completed]="campaniaSeleccionada()?.status === 'COMPLETED'" [class.st-paused]="campaniaSeleccionada()?.status === 'PAUSED'">
                  <span class="status-pulse-dot"></span>
                  {{ campaignStatusLabel(campaniaSeleccionada()?.status ?? '') }}
                </span>
                @if (campaniaSeleccionada()?.jerarquiaResumen) {
                  <span class="jerarquia-tag-badge">{{ campaniaSeleccionada()?.jerarquiaResumen }}</span>
                }
              </div>
            </div>
            <button type="button" class="close-btn" (click)="cerrarModalDetalleCampania()"><i class="pi pi-times"></i></button>
          </div>

          <div class="modal-body">
            @if (loadingDetalleCampania()) {
              <div class="loading-box">
                <i class="pi pi-spin pi-spinner"></i>
                <span>Cargando métricas y mensajes de la campaña…</span>
              </div>
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
                    <button type="button" class="btn-action-green" [disabled]="startingCampaignId() === campaniaSeleccionada()?.id" (click)="iniciarCampania(campaniaSeleccionada()!.id)">
                      <i class="pi pi-play"></i> Iniciar campaña
                    </button>
                  } @else if (campaniaSeleccionada()?.status === 'RUNNING') {
                    <button type="button" class="btn-tbl-action warn" (click)="pausarCampania(campaniaSeleccionada()!.id)">
                      <i class="pi pi-pause"></i> Pausar
                    </button>
                  } @else if (campaniaSeleccionada()?.status === 'PAUSED') {
                    <button type="button" class="btn-action-green" (click)="reanudarCampania(campaniaSeleccionada()!.id)">
                      <i class="pi pi-play"></i> Reanudar
                    </button>
                  }

                  @if (campaniaSeleccionada()?.status === 'RUNNING' || campaniaSeleccionada()?.status === 'PAUSED') {
                    <button type="button" class="btn-tbl-action danger" (click)="cancelarCampania(campaniaSeleccionada()!.id)">
                      <i class="pi pi-times"></i> Cancelar
                    </button>
                  }
                </div>

                <div class="action-buttons-right">
                  <input pInputText type="text" placeholder="Filtrar mensajes..." [(ngModel)]="filtroMensajesCampania" name="filtroMensajesCampania" class="filtro-input" />
                  <button type="button" class="btn-micro" (click)="recargarMensajesCampaniaSeleccionada()" title="Actualizar mensajes">
                    <i class="pi pi-refresh"></i>
                  </button>
                </div>
              </div>

              <!-- TABLA DE MENSAJES -->
              <div class="modal-table-scroll messages-table-wrap">
                <table class="cj-table">
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
                          <span class="status-pill-badge" [class.st-running]="msg.status === 'SUBMITTED' || msg.status === 'PROCESSING'" [class.st-completed]="msg.status === 'SENT' || msg.status === 'DELIVERED'" [class.st-paused]="msg.status === 'PENDING' || msg.status === 'HELD'" [class.st-failed]="msg.status === 'FAILED'">
                            {{ msg.status }}
                          </span>
                        </td>
                        <td>{{ msg.attemptCount }} / {{ msg.maxAttempts }}</td>
                        <td>{{ msg.sentAt ? (msg.sentAt | date:'HH:mm:ss') : '—' }}</td>
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
              <div class="form-group">
                <label for="edit-rec-name">Nombre de la campaña</label>
                <input pInputText id="edit-rec-name" name="editRecName" [(ngModel)]="editRecurrenteName" class="cj-input w-full" />
              </div>

              <div class="form-group">
                <label for="edit-rec-interval">Frecuencia de envío automático</label>
                <select id="edit-rec-interval" name="editRecInterval" [(ngModel)]="editRecurrenteIntervalMinutes" class="cj-select w-full">
                  @for (preset of intervalPresets; track preset.minutes) {
                    <option [value]="preset.minutes">{{ preset.label }}</option>
                  }
                </select>
              </div>

              <div class="form-group">
                <label>Sesiones emisoras ({{ editRecurrenteSessionIds().length }} seleccionada(s))</label>
                <div class="session-toolbar-box">
                  <div class="session-filters-row">
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
                      styleClass="cj-multiselect-mini"
                    />
                    <p-multiSelect
                      [options]="municipioOptions()"
                      [ngModel]="editFiltroMunicipiosSesion()"
                      (ngModelChange)="editFiltroMunicipiosSesion.set($event)"
                      optionLabel="label"
                      optionValue="value"
                      placeholder="Filtrar por municipio..."
                      [showClear]="true"
                      display="chip"
                      [maxSelectedLabels]="1"
                      filter="true"
                      filterPlaceHolder="Buscar municipio..."
                      styleClass="cj-multiselect-mini"
                    />
                  </div>
                  <div class="session-quick-actions">
                    <button type="button" class="btn-micro" (click)="editSeleccionarTodasConectadas()">Conectadas</button>
                    <button type="button" class="btn-micro" (click)="editSeleccionarTodasVisibles()">Marcar visibles</button>
                    <button type="button" class="btn-micro btn-micro-clear" (click)="editDeseleccionarTodasSesiones()">Limpiar</button>
                  </div>
                </div>

                <div class="session-cards-container">
                  @for (session of editSesionesFiltradas(); track session.id) {
                    <div class="session-item-card" [class.selected]="editRecurrenteSessionIds().includes(session.id)" (click)="toggleEditSession(session.id)">
                      <input type="checkbox" [checked]="editRecurrenteSessionIds().includes(session.id)" (click)="$event.stopPropagation()" (change)="toggleEditSession(session.id)" />
                      <div class="session-info-content">
                        <span class="session-card-name">{{ session.name }}</span>
                        <div class="session-card-meta">
                          @if (session.phoneE164) { <code>{{ session.phoneE164 }}</code> }
                          <span class="session-status-badge" [class.connected]="session.status === 'CONNECTED'">{{ sessionStatusLabel(session.status) }}</span>
                        </div>
                      </div>
                    </div>
                  } @empty {
                    <div class="empty-sessions-box">No hay sesiones para este filtro.</div>
                  }
                </div>
              </div>

              <div class="form-group">
                <label for="edit-rec-message">Mensaje</label>
                <textarea id="edit-rec-message" name="editRecMessage" rows="4" [(ngModel)]="editRecurrenteMessageText" class="cj-textarea w-full"></textarea>
              </div>

              <div class="form-two-cols">
                <div class="form-group">
                  <label for="edit-rec-media">Multimedia (opcional)</label>
                  <select id="edit-rec-media" name="editRecMedia" [(ngModel)]="editRecurrenteMediaAssetId" class="cj-select w-full">
                    <option value="">Sin multimedia</option>
                    @for (item of mediaItems(); track item.id) {
                      <option [value]="item.id">{{ item.fileName }}</option>
                    }
                  </select>
                </div>

                <div class="form-group">
                  <label for="edit-rec-region">País / región</label>
                  <select id="edit-rec-region" name="editRecRegion" [(ngModel)]="editRecurrenteDefaultRegion" class="cj-select w-full">
                    @for (region of regionOptions; track region.code) {
                      <option [value]="region.code">{{ region.label }}</option>
                    }
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div class="modal-footer">
            <p-button type="button" label="Cancelar" severity="secondary" (onClick)="cerrarModalEditarRecurrente()" />
            <button
              type="button"
              class="btn-action-green"
              [disabled]="!editRecurrenteName.trim() || editRecurrenteSessionIds().length === 0 || savingEditRecurring()"
              (click)="guardarEdicionRecurrente()"
            >
              <i class="pi" [class.pi-check]="!savingEditRecurring()" [class.pi-spin]="savingEditRecurring()" [class.pi-spinner]="savingEditRecurring()"></i>
              <span>Guardar cambios</span>
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    /* ========================================================= */
    /* LAYOUT & HERO HEADER                                     */
    /* ========================================================= */
    .cj-page { max-width: 1560px; margin: 0 auto; padding: 1.5rem 1.25rem 3rem; }
    .cj-hero-header {
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f2744 100%);
      border-radius: 16px;
      padding: 1.6rem 2rem;
      color: #fff;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 1.2rem;
      margin-bottom: 1.5rem;
      box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.25);
      border: 1px solid rgba(255, 255, 255, 0.08);
    }
    .hero-text-box { display: flex; flex-direction: column; gap: 0.35rem; max-width: 860px; }
    .hero-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      background: rgba(37, 99, 235, 0.25);
      border: 1px solid rgba(96, 165, 250, 0.4);
      color: #93c5fd;
      padding: 0.25rem 0.65rem;
      border-radius: 999px;
      font-size: 0.72rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      width: fit-content;
    }
    .hero-text-box h1 { margin: 0; font-size: 1.7rem; font-weight: 800; letter-spacing: -0.02em; color: #ffffff; }
    .hero-sub { margin: 0; font-size: 0.88rem; color: #94a3b8; line-height: 1.45; }
    .btn-hero-action {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.2);
      color: #ffffff;
      padding: 0.6rem 1.1rem;
      border-radius: 10px;
      font-size: 0.84rem;
      font-weight: 600;
      cursor: pointer;
      backdrop-filter: blur(8px);
      transition: all 0.2s ease;
    }
    .btn-hero-action:hover { background: rgba(255, 255, 255, 0.2); transform: translateY(-1px); }

    /* ========================================================= */
    /* CARDS CONTAINER & HEADER                                 */
    /* ========================================================= */
    .cj-card {
      background: #ffffff;
      border-radius: 16px;
      border: 1px solid #e2e8f0;
      box-shadow: 0 4px 16px rgba(15, 23, 42, 0.04);
      overflow: hidden;
      margin-bottom: 1.5rem;
      transition: box-shadow 0.2s ease;
    }
    .cj-card:hover { box-shadow: 0 8px 24px rgba(15, 23, 42, 0.07); }
    .card-header-custom {
      padding: 1.2rem 1.5rem;
      border-bottom: 1px solid #f1f5f9;
      background: #f8fafc;
      display: flex;
      align-items: center;
      gap: 0.9rem;
    }
    .header-with-actions { justify-content: space-between; flex-wrap: wrap; }
    .header-left-flex { display: flex; align-items: center; gap: 0.9rem; }
    .header-icon-pill {
      width: 38px;
      height: 38px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      font-size: 0.9rem;
      flex-shrink: 0;
    }
    .step-1 { background: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe; }
    .step-2 { background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0; }
    .step-3 { background: #faf5ff; color: #9333ea; border: 1px solid #e9d5ff; }
    .step-4 { background: #f0f9ff; color: #0284c7; border: 1px solid #bae6fd; }
    .header-title-box h2 { margin: 0; font-size: 1.15rem; font-weight: 700; color: #0f172a; }
    .header-desc { font-size: 0.78rem; color: #64748b; }
    .card-body-custom { padding: 1.5rem; }

    /* ========================================================= */
    /* FORM FIELDS & INPUTS                                     */
    /* ========================================================= */
    .filter-field, .form-group { display: flex; flex-direction: column; gap: 0.4rem; margin-bottom: 0.85rem; }
    .filter-label-row, .session-header-row, .msg-header-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.4rem;
    }
    .filter-field label, .form-group label {
      font-size: 0.84rem;
      font-weight: 700;
      color: #1e293b;
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }
    .count-pill {
      font-size: 0.72rem;
      font-weight: 600;
      color: #64748b;
      background: #f1f5f9;
      padding: 0.15rem 0.5rem;
      border-radius: 999px;
    }
    .cj-input, .cj-textarea, .cj-select {
      border: 1px solid #cbd5e1;
      border-radius: 10px;
      padding: 0.6rem 0.85rem;
      font-size: 0.86rem;
      color: #1e293b;
      background: #ffffff;
      outline: none;
      transition: all 0.15s ease;
    }
    .cj-input:focus, .cj-textarea:focus, .cj-select:focus {
      border-color: #3b82f6;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
    }
    :host ::ng-deep .cj-multiselect .p-multiselect {
      border: 1px solid #cbd5e1;
      border-radius: 10px;
      font-size: 0.86rem;
      transition: all 0.15s ease;
    }
    :host ::ng-deep .cj-multiselect .p-multiselect:hover { border-color: #94a3b8; }
    :host ::ng-deep .cj-multiselect .p-multiselect.p-focus {
      border-color: #3b82f6;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
    }
    .form-two-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }

    /* ========================================================= */
    /* AUDIENCE CARDS                                           */
    /* ========================================================= */
    .audience-section {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 1rem;
      margin-top: 0.6rem;
    }
    .audience-section-title {
      font-size: 0.84rem;
      font-weight: 700;
      color: #0f172a;
      display: flex;
      align-items: center;
      gap: 0.4rem;
      margin-bottom: 0.75rem;
    }
    .audience-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 0.6rem;
    }
    .audience-card {
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 10px;
      padding: 0.75rem 0.9rem;
      display: flex;
      align-items: flex-start;
      gap: 0.75rem;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .audience-card:hover { border-color: #3b82f6; background: #f0f7ff; transform: translateY(-1px); }
    .audience-card.active {
      border-color: #2563eb;
      background: #eff6ff;
      box-shadow: 0 0 0 2px #2563eb;
    }
    .card-radio-dot {
      width: 18px;
      height: 18px;
      border-radius: 50%;
      border: 2px solid #94a3b8;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      margin-top: 2px;
      transition: all 0.15s ease;
    }
    .audience-card.active .card-radio-dot {
      border-color: #2563eb;
    }
    .dot-inner {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: transparent;
      transition: all 0.15s ease;
    }
    .audience-card.active .dot-inner { background: #2563eb; }
    .audience-info { display: flex; flex-direction: column; gap: 0.15rem; }
    .audience-badge {
      font-size: 0.68rem;
      font-weight: 700;
      padding: 0.1rem 0.4rem;
      border-radius: 4px;
      width: fit-content;
      margin-bottom: 0.1rem;
    }
    .badge-green { background: #dcfce7; color: #15803d; }
    .badge-amber { background: #fef3c7; color: #b45309; }
    .badge-blue { background: #dbeafe; color: #1d4ed8; }
    .badge-purple { background: #f3e8ff; color: #7e22ce; }
    .audience-name { font-size: 0.82rem; font-weight: 700; color: #0f172a; }
    .audience-desc { font-size: 0.72rem; color: #64748b; line-height: 1.35; }

    /* ========================================================= */
    /* SELECTION FOOTER & CONTACTS SUMMARY                      */
    /* ========================================================= */
    .selection-footer-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.8rem;
      margin-top: 1rem;
      padding-top: 0.8rem;
      border-top: 1px solid #f1f5f9;
    }
    .selection-status-badge {
      font-size: 0.82rem;
      color: #334155;
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }
    .selection-status-badge i { color: #2563eb; }
    .selection-buttons { display: flex; gap: 0.5rem; }
    .btn-primary-custom {
      background: #2563eb;
      color: #ffffff;
      border: none;
      border-radius: 9px;
      padding: 0.55rem 1.1rem;
      font-size: 0.84rem;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      transition: all 0.15s ease;
    }
    .btn-primary-custom:hover:not(:disabled) { background: #1d4ed8; transform: translateY(-1px); }
    .btn-primary-custom:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-secondary-custom {
      background: #f1f5f9;
      color: #475569;
      border: 1px solid #e2e8f0;
      border-radius: 9px;
      padding: 0.55rem 0.9rem;
      font-size: 0.84rem;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      transition: all 0.15s ease;
    }
    .btn-secondary-custom:hover:not(:disabled) { background: #e2e8f0; color: #0f172a; }

    .contactos-results-card {
      margin-top: 1.2rem;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 1rem;
    }
    .results-header { font-size: 0.82rem; font-weight: 700; color: #0f172a; margin-bottom: 0.6rem; }
    .kpi-micro-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.6rem; margin-bottom: 0.8rem; }
    .kpi-box {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 0.75rem 0.6rem;
      text-align: center;
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
    }
    .kpi-num { font-size: 1.3rem; font-weight: 800; color: #0f172a; }
    .kpi-tag { font-size: 0.72rem; color: #64748b; display: flex; align-items: center; justify-content: center; gap: 0.3rem; }
    .highlight-box { border-color: #93c5fd; background: #eff6ff; }
    .highlight-box .kpi-num { color: #1d4ed8; }
    .highlight-box .kpi-tag { color: #2563eb; font-weight: 600; }
    .destinatarios-modal-banner {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.6rem;
      background: #eef2ff;
      border: 1px solid #c7d2fe;
      border-radius: 8px;
      padding: 0.6rem 0.9rem;
      font-size: 0.8rem;
      color: #3730a3;
    }
    .banner-text { display: flex; align-items: center; gap: 0.4rem; }
    .btn-modal-open {
      background: #4338ca;
      color: #ffffff;
      border: none;
      border-radius: 6px;
      padding: 0.35rem 0.75rem;
      font-size: 0.75rem;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
    }
    .btn-modal-open:hover { background: #3730a3; }

    /* ========================================================= */
    /* SESSIONS SELECTION LIST (FIXED STYLING)                   */
    /* ========================================================= */
    .session-toolbar-box {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 0.7rem;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      margin-bottom: 0.5rem;
    }
    .session-toggle-pills { display: flex; gap: 0.4rem; flex-wrap: wrap; }
    .tab-pill {
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 999px;
      padding: 0.35rem 0.8rem;
      font-size: 0.76rem;
      font-weight: 600;
      color: #475569;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .tab-pill.active { background: #0f172a; color: #ffffff; border-color: #0f172a; }
    .session-filters-row { display: flex; gap: 0.4rem; flex-wrap: wrap; }
    :host ::ng-deep .cj-multiselect-mini .p-multiselect {
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      font-size: 0.78rem;
      min-width: 170px;
    }
    .session-quick-actions { display: flex; gap: 0.35rem; flex-wrap: wrap; }
    .btn-micro {
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 0.25rem 0.6rem;
      font-size: 0.72rem;
      font-weight: 600;
      color: #334155;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      transition: all 0.12s ease;
    }
    .btn-micro:hover { background: #f1f5f9; color: #0f172a; border-color: #94a3b8; }
    .btn-micro-clear { color: #94a3b8; }
    .session-notice {
      display: flex;
      align-items: flex-start;
      gap: 0.4rem;
      background: #fefce8;
      border: 1px solid #fef08a;
      border-radius: 8px;
      padding: 0.55rem 0.8rem;
      font-size: 0.75rem;
      color: #854d0e;
      margin-bottom: 0.5rem;
    }
    .session-cards-container {
      max-height: 180px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 0.5rem;
      background: #f8fafc;
    }
    .session-item-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 0.55rem 0.75rem;
      display: flex;
      align-items: center;
      gap: 0.7rem;
      cursor: pointer;
      transition: all 0.12s ease;
    }
    .session-item-card:hover { border-color: #93c5fd; background: #f0f7ff; }
    .session-item-card.selected { border-color: #2563eb; background: #eff6ff; }
    .session-info-content {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex: 1;
      flex-wrap: wrap;
      gap: 0.4rem;
    }
    .session-card-name { font-size: 0.82rem; font-weight: 700; color: #0f172a; }
    .session-card-meta { display: flex; align-items: center; gap: 0.5rem; }
    .session-phone { font-size: 0.75rem; background: #f1f5f9; padding: 0.1rem 0.35rem; border-radius: 4px; color: #334155; }
    .session-status-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
      font-size: 0.7rem;
      font-weight: 700;
      padding: 0.15rem 0.5rem;
      border-radius: 999px;
      background: #e2e8f0;
      color: #475569;
    }
    .session-status-badge.connected { background: #dcfce7; color: #15803d; }
    .session-status-badge.quarantined { background: #fef3c7; color: #92400e; }
    .status-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
    .empty-sessions-box {
      padding: 1.5rem;
      text-align: center;
      color: #64748b;
      font-size: 0.8rem;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.4rem;
    }

    /* ========================================================= */
    /* MESSAGE AREA & SPINTAX HELPER                            */
    /* ========================================================= */
    .variable-chips { display: flex; align-items: center; gap: 0.3rem; flex-wrap: wrap; }
    .var-title { font-size: 0.72rem; color: #64748b; font-weight: 600; }
    .chip-tag {
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      color: #1d4ed8;
      font-size: 0.72rem;
      font-weight: 700;
      padding: 0.15rem 0.45rem;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.12s ease;
    }
    .chip-tag:hover { background: #dbeafe; transform: translateY(-1px); }
    .spintax-helper-box {
      display: flex;
      align-items: flex-start;
      gap: 0.5rem;
      background: #f0f9ff;
      border: 1px solid #bae6fd;
      border-radius: 8px;
      padding: 0.55rem 0.8rem;
      font-size: 0.76rem;
      color: #0369a1;
      line-height: 1.4;
    }
    .spintax-live-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-left: 4px solid #3b82f6;
      border-radius: 8px;
      padding: 0.6rem 0.8rem;
      display: flex;
      flex-direction: column;
      gap: 0.3rem;
    }
    .spintax-live-header { display: flex; justify-content: space-between; align-items: center; font-size: 0.75rem; font-weight: 700; color: #0f172a; }
    .spintax-live-quote { font-size: 0.82rem; color: #334155; font-style: italic; background: #ffffff; padding: 0.4rem 0.6rem; border-radius: 6px; border: 1px solid #e2e8f0; }

    /* ========================================================= */
    /* DAILY LIMIT & VALIDATION BAR                             */
    /* ========================================================= */
    .daily-limit-box {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 0.9rem;
    }
    .daily-limit-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.3rem; }
    .sub-tip { font-size: 0.72rem; font-weight: 700; color: #059669; background: #ecfdf5; padding: 0.1rem 0.4rem; border-radius: 4px; }
    .pacing-live-banner {
      display: flex;
      align-items: flex-start;
      gap: 0.5rem;
      background: #ecfdf5;
      border: 1px solid #6ee7b7;
      color: #065f46;
      padding: 0.6rem 0.8rem;
      border-radius: 8px;
      font-size: 0.78rem;
      line-height: 1.4;
      margin-top: 0.5rem;
    }
    .validation-bar-box {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.6rem;
      padding: 0.6rem 0;
    }
    .btn-validate {
      background: #f1f5f9;
      color: #334155;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 0.5rem 0.9rem;
      font-size: 0.8rem;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      transition: all 0.15s ease;
    }
    .btn-validate:hover:not(:disabled) { background: #e2e8f0; }
    .val-pills-row { display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; }
    .val-tag { font-size: 0.74rem; font-weight: 700; padding: 0.2rem 0.5rem; border-radius: 6px; }
    .val-tag.ok { background: #dcfce7; color: #15803d; }
    .val-tag.bad { background: #fee2e2; color: #b91c1c; }
    .val-tag.dup { background: #fef3c7; color: #b45309; }

    .consent-check-card {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 0.75rem 0.9rem;
      font-size: 0.82rem;
      color: #334155;
      cursor: pointer;
      margin: 0.4rem 0;
    }
    .btn-submit-campaign {
      background: linear-gradient(135deg, #16a34a 0%, #15803d 100%);
      color: #ffffff;
      border: none;
      border-radius: 12px;
      padding: 0.85rem 1.4rem;
      font-size: 0.92rem;
      font-weight: 700;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      box-shadow: 0 4px 12px rgba(22, 163, 74, 0.25);
      transition: all 0.15s ease;
      width: 100%;
      margin-top: 0.5rem;
    }
    .btn-submit-campaign:hover:not(:disabled) { background: linear-gradient(135deg, #15803d 0%, #166534 100%); transform: translateY(-1px); }
    .btn-submit-campaign:disabled { opacity: 0.5; cursor: not-allowed; }

    .created-campaign-card {
      margin-top: 1rem;
      background: #f0fdf4;
      border: 1px solid #86efac;
      border-radius: 12px;
      padding: 0.9rem 1.1rem;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    .created-card-top { display: flex; align-items: center; gap: 0.6rem; color: #15803d; }
    .created-card-top i { font-size: 1.3rem; }
    .created-card-top div { display: flex; flex-direction: column; font-size: 0.84rem; }
    .created-card-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
    .btn-action-green {
      background: #16a34a;
      color: #ffffff;
      border: none;
      border-radius: 8px;
      padding: 0.45rem 0.9rem;
      font-size: 0.8rem;
      font-weight: 700;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
    }
    .btn-action-green:hover:not(:disabled) { background: #15803d; }
    .btn-action-outline {
      background: #ffffff;
      border: 1px solid #cbd5e1;
      color: #334155;
      border-radius: 8px;
      padding: 0.45rem 0.9rem;
      font-size: 0.8rem;
      font-weight: 600;
      cursor: pointer;
    }

    /* ========================================================= */
    /* RECURRING SECTION (3)                                    */
    /* ========================================================= */
    .recurring-config-row {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 1rem;
      align-items: flex-end;
    }
    .rec-field { display: flex; flex-direction: column; gap: 0.4rem; }
    .rec-field label { font-size: 0.84rem; font-weight: 700; color: #1e293b; display: flex; align-items: center; gap: 0.4rem; }
    .btn-save-recurring {
      background: #7c3aed;
      color: #ffffff;
      border: none;
      border-radius: 10px;
      padding: 0.6rem 1.2rem;
      font-size: 0.84rem;
      font-weight: 700;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      height: 42px;
      white-space: nowrap;
      transition: all 0.15s ease;
    }
    .btn-save-recurring:hover:not(:disabled) { background: #6d28d9; }
    .btn-save-recurring:disabled { opacity: 0.5; cursor: not-allowed; }
    .recurring-help-note {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      font-size: 0.76rem;
      color: #64748b;
      margin-top: 0.5rem;
    }

    /* ========================================================= */
    /* CAMPAIGNS LIST & POWERFUL FILTERS (4)                    */
    /* ========================================================= */
    .btn-refresh-pill {
      background: #ffffff;
      border: 1px solid #cbd5e1;
      color: #334155;
      border-radius: 999px;
      padding: 0.4rem 0.9rem;
      font-size: 0.78rem;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      transition: all 0.15s ease;
    }
    .btn-refresh-pill:hover { background: #f1f5f9; border-color: #94a3b8; }

    .campaign-filters-panel {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 14px;
      padding: 1.1rem;
      margin-bottom: 1.2rem;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .filter-controls-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 0.85rem;
      align-items: flex-end;
    }
    .search-ctrl { grid-column: span 2; }
    .presets-ctrl { grid-column: span 2; }
    .date-range-ctrl { grid-column: span 2; }
    .ctrl-item { display: flex; flex-direction: column; gap: 0.35rem; }
    .ctrl-item label { font-size: 0.78rem; font-weight: 700; color: #334155; display: flex; align-items: center; gap: 0.35rem; }
    .input-with-icon { position: relative; display: flex; align-items: center; }
    .input-with-icon i.pi-search { position: absolute; left: 0.85rem; color: #94a3b8; font-size: 0.85rem; }
    .input-with-icon input { padding-left: 2.2rem; padding-right: 2rem; }
    .clear-input-btn {
      position: absolute;
      right: 0.6rem;
      background: none;
      border: none;
      color: #94a3b8;
      cursor: pointer;
      padding: 0.2rem;
      border-radius: 50%;
    }
    .clear-input-btn:hover { color: #0f172a; }

    .preset-buttons-row { display: flex; gap: 0.3rem; flex-wrap: wrap; }
    .btn-preset {
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 7px;
      padding: 0.35rem 0.65rem;
      font-size: 0.74rem;
      font-weight: 600;
      color: #475569;
      cursor: pointer;
      transition: all 0.12s ease;
    }
    .btn-preset:hover { background: #f1f5f9; border-color: #94a3b8; }
    .btn-preset.active { background: #0f172a; color: #ffffff; border-color: #0f172a; }

    .date-inputs-row { display: flex; gap: 0.5rem; align-items: center; }
    .date-sub { display: flex; align-items: center; gap: 0.35rem; font-size: 0.74rem; color: #64748b; font-weight: 600; }
    .cj-input-date {
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 0.4rem 0.6rem;
      font-size: 0.78rem;
      color: #1e293b;
      background: #ffffff;
      outline: none;
    }
    .cj-input-date:focus { border-color: #3b82f6; }

    .reset-ctrl { justify-content: flex-end; }
    .btn-reset-filters {
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 0.55rem 0.9rem;
      font-size: 0.78rem;
      font-weight: 600;
      color: #64748b;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      height: 38px;
      transition: all 0.15s ease;
    }
    .btn-reset-filters:hover { background: #fee2e2; color: #b91c1c; border-color: #fca5a5; }

    /* SUMMARY KPIS BAR */
    .campaign-kpis-summary-bar {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 0.6rem;
      padding-top: 0.8rem;
      border-top: 1px solid #e2e8f0;
    }
    .kpi-sum-item {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 0.6rem 0.8rem;
      display: flex;
      flex-direction: column;
      gap: 0.1rem;
    }
    .sum-label { font-size: 0.68rem; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.03em; }
    .sum-value { font-size: 1.15rem; font-weight: 800; color: #0f172a; }
    .kpi-sum-item.ok { border-color: #86efac; }
    .kpi-sum-item.ok .sum-value { color: #15803d; }
    .kpi-sum-item.fail { border-color: #fca5a5; }
    .kpi-sum-item.fail .sum-value { color: #dc2626; }
    .kpi-sum-item.highlight { border-color: #93c5fd; background: #f0f7ff; }
    .kpi-sum-item.highlight .sum-value { color: #1d4ed8; }

    /* ========================================================= */
    /* CUSTOM TABLES                                            */
    /* ========================================================= */
    .table-responsive-box { overflow-x: auto; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff; }
    .cj-table { width: 100%; border-collapse: collapse; font-size: 0.84rem; text-align: left; }
    .cj-table th {
      background: #f8fafc;
      color: #475569;
      font-size: 0.72rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      padding: 0.75rem 1rem;
      border-bottom: 2px solid #e2e8f0;
    }
    .cj-table td {
      padding: 0.85rem 1rem;
      border-bottom: 1px solid #f1f5f9;
      vertical-align: middle;
    }
    .campaign-row:hover td { background: #f8fafc; }

    .camp-title-box { display: flex; flex-direction: column; gap: 0.15rem; }
    .camp-name { font-weight: 700; color: #0f172a; font-size: 0.88rem; }
    .camp-id { font-size: 0.68rem; color: #94a3b8; font-family: monospace; }
    .jerarquia-tag-badge {
      display: inline-block;
      background: #eef2ff;
      color: #3730a3;
      border: 1px solid #c7d2fe;
      border-radius: 6px;
      padding: 0.2rem 0.5rem;
      font-size: 0.72rem;
      font-weight: 600;
      max-width: 240px;
      white-space: normal;
      line-height: 1.35;
    }
    .muted-small { font-size: 0.75rem; color: #94a3b8; }

    .status-pill-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0.25rem 0.65rem;
      border-radius: 999px;
      font-size: 0.72rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.02em;
    }
    .st-running { background: #dbeafe; color: #1e40af; }
    .st-completed { background: #dcfce7; color: #15803d; }
    .st-paused { background: #fef3c7; color: #92400e; }
    .st-draft { background: #f1f5f9; color: #475569; }
    .st-failed { background: #fee2e2; color: #b91c1c; }
    .status-pulse-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
    .st-running .status-pulse-dot { animation: pulseAnim 1.4s infinite; }
    @keyframes pulseAnim { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.4; transform: scale(1.4); } }

    /* PROGRESS BAR */
    .progress-container { display: flex; flex-direction: column; gap: 0.25rem; min-width: 140px; max-width: 180px; }
    .progress-labels { display: flex; justify-content: space-between; font-size: 0.74rem; }
    .sent-count strong { color: #15803d; }
    .percent-label { font-weight: 700; color: #334155; }
    .progress-bar-track {
      height: 6px;
      background: #e2e8f0;
      border-radius: 999px;
      overflow: hidden;
    }
    .progress-bar-fill {
      height: 100%;
      background: #2563eb;
      border-radius: 999px;
      transition: width 0.3s ease;
    }
    .progress-bar-fill.complete { background: #16a34a; }
    .failed-count-note { font-size: 0.68rem; color: #dc2626; font-weight: 600; display: flex; align-items: center; gap: 0.2rem; }

    .date-cell { display: flex; flex-direction: column; gap: 0.1rem; }
    .date-main { font-size: 0.8rem; font-weight: 600; color: #1e293b; }
    .date-time { font-size: 0.7rem; color: #94a3b8; }

    .table-actions-row { display: flex; align-items: center; gap: 0.35rem; }
    .btn-action-start {
      background: #16a34a;
      color: #ffffff;
      border: none;
      border-radius: 6px;
      padding: 0.35rem 0.65rem;
      font-size: 0.74rem;
      font-weight: 700;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
    }
    .btn-action-start:hover { background: #15803d; }
    .btn-tbl-action {
      background: #f1f5f9;
      border: 1px solid #e2e8f0;
      color: #334155;
      border-radius: 6px;
      padding: 0.35rem 0.6rem;
      font-size: 0.74rem;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      transition: all 0.12s ease;
    }
    .btn-tbl-action:hover { background: #e2e8f0; color: #0f172a; }
    .btn-tbl-action.warn:hover { background: #fef3c7; color: #92400e; border-color: #fde68a; }
    .btn-tbl-action.success:hover { background: #dcfce7; color: #15803d; border-color: #bbf7d0; }
    .btn-tbl-action.danger:hover { background: #fee2e2; color: #b91c1c; border-color: #fecdd3; }
    .btn-tbl-action.info { background: #eff6ff; color: #1d4ed8; border-color: #bfdbfe; font-weight: 700; }
    .btn-tbl-action.info:hover { background: #dbeafe; }

    /* PAGINATION BAR */
    .pagination-footer-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.8rem;
      padding: 0.9rem 0.2rem 0;
    }
    .page-size-selector { display: flex; align-items: center; gap: 0.5rem; font-size: 0.78rem; color: #64748b; }
    .cj-select-mini {
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 0.25rem 0.5rem;
      font-size: 0.78rem;
      background: #ffffff;
    }
    .total-count-text { font-size: 0.78rem; color: #475569; font-weight: 600; margin-left: 0.5rem; }
    .pagination-controls { display: flex; align-items: center; gap: 0.6rem; }
    .btn-page {
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 0.35rem 0.7rem;
      font-size: 0.76rem;
      font-weight: 600;
      color: #334155;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
    }
    .btn-page:hover:not(:disabled) { background: #f1f5f9; }
    .btn-page:disabled { opacity: 0.4; cursor: not-allowed; }
    .page-indicator { font-size: 0.78rem; font-weight: 700; color: #1e293b; }

    /* ========================================================= */
    /* MODALS                                                    */
    /* ========================================================= */
    .custom-modal-backdrop {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(15, 23, 42, 0.7);
      backdrop-filter: blur(6px);
      z-index: 9999;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1rem;
    }
    .custom-modal {
      background: #ffffff;
      border-radius: 16px;
      box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);
      display: flex;
      flex-direction: column;
      max-height: 90vh;
      overflow: hidden;
      animation: modalIn 0.18s ease-out;
    }
    @keyframes modalIn { from { opacity: 0; transform: scale(0.97); } to { opacity: 1; transform: scale(1); } }
    .modal-large { width: 100%; max-width: 860px; }
    .modal-xlarge { width: 100%; max-width: 1120px; }
    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1.1rem 1.5rem;
      border-bottom: 1px solid #e2e8f0;
      background: #f8fafc;
    }
    .modal-title-box h2 { margin: 0; font-size: 1.15rem; font-weight: 700; color: #0f172a; display: flex; align-items: center; gap: 0.5rem; }
    .modal-sub { display: flex; align-items: center; gap: 0.5rem; margin-top: 0.25rem; flex-wrap: wrap; }
    .close-btn {
      background: none;
      border: none;
      font-size: 1.2rem;
      color: #64748b;
      cursor: pointer;
      padding: 0.4rem;
      border-radius: 6px;
      transition: all 0.15s;
    }
    .close-btn:hover { background: #e2e8f0; color: #0f172a; }
    .modal-body { padding: 1.4rem; overflow-y: auto; display: flex; flex-direction: column; gap: 1rem; flex: 1; }
    .modal-footer { padding: 0.9rem 1.4rem; border-top: 1px solid #e2e8f0; background: #f8fafc; display: flex; justify-content: flex-end; gap: 0.5rem; }
    .modal-table-scroll { max-height: 380px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 8px; background: #ffffff; }

    .validation-summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.5rem; margin-bottom: 0.5rem; }
    .validation-summary > div { border: 1px solid #e2e8f0; border-radius: 8px; padding: 0.5rem; text-align: center; display: flex; flex-direction: column; }
    .validation-summary strong { font-size: 1.2rem; }
    .validation-summary span { font-size: 0.72rem; color: #64748b; }
    .validation-summary .highlight { border-color: #3b82f6; background: #eff6ff; }
    .validation-summary .highlight strong { color: #1d4ed8; }

    .lista-toolbar { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; flex-wrap: wrap; }
    .lista-tabs { display: flex; gap: 0.3rem; flex-wrap: wrap; }
    .tab-btn { border: 1px solid #cbd5e1; background: #f8fafc; border-radius: 999px; padding: 0.3rem 0.7rem; font-size: 0.76rem; font-weight: 600; cursor: pointer; }
    .tab-btn.active { background: #0f172a; color: #fff; border-color: #0f172a; }
    .filtro-input { min-width: 220px; border-radius: 8px; font-size: 0.8rem; }
    .numeros-list { display: flex; flex-direction: column; }
    .numero-row { display: grid; grid-template-columns: minmax(130px, auto) 1fr auto; gap: 0.6rem; padding: 0.5rem 0.8rem; border-bottom: 1px solid #f1f5f9; font-size: 0.82rem; align-items: center; }
    .numero-row.ok .numero-e164 { color: #15803d; font-weight: 700; }
    .numero-row.bad .numero-e164 { color: #b91c1c; font-weight: 700; }
    .numero-row.dup .numero-e164 { color: #b45309; font-weight: 700; }
    .numero-badge { font-size: 0.7rem; padding: 0.15rem 0.45rem; border-radius: 4px; background: #e2e8f0; color: #475569; }
    .numero-badge.ok { background: #dcfce7; color: #15803d; font-weight: 700; }
    .numero-badge.dup { background: #fef3c7; color: #b45309; font-weight: 700; }

    .campaign-metrics-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 0.5rem; }
    .metric-card { border: 1px solid #e2e8f0; border-radius: 10px; padding: 0.6rem; text-align: center; display: flex; flex-direction: column; gap: 0.15rem; background: #f8fafc; }
    .metric-card span { font-size: 0.7rem; color: #64748b; text-transform: uppercase; }
    .metric-card strong { font-size: 1.3rem; color: #0f172a; }
    .metric-card.ok { border-color: #86efac; background: #f0fdf4; }
    .metric-card.ok strong { color: #15803d; }
    .metric-card.proc { border-color: #93c5fd; background: #eff6ff; }
    .metric-card.proc strong { color: #1d4ed8; }
    .metric-card.fail { border-color: #fca5a5; background: #fef2f2; }
    .metric-card.fail strong { color: #b91c1c; }
    .metric-card.pend { border-color: #cbd5e1; }
    .modal-actions-bar { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.6rem; }
    .action-buttons-left { display: flex; gap: 0.4rem; }
    .action-buttons-right { display: flex; gap: 0.4rem; align-items: center; }

    .empty-state-card {
      padding: 2.5rem;
      text-align: center;
      color: #64748b;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.85rem;
    }
    .empty-state-card i { font-size: 2rem; color: #cbd5e1; }
    .loading-box {
      padding: 2.5rem;
      text-align: center;
      color: #2563eb;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.6rem;
      font-size: 0.88rem;
      font-weight: 600;
    }
    .loading-box i { font-size: 1.8rem; }
    .error-alert { background: #fee2e2; border: 1px solid #fca5a5; color: #b91c1c; border-radius: 8px; padding: 0.75rem 1rem; display: flex; align-items: center; gap: 0.5rem; font-size: 0.84rem; }
    .alert-empty { background: #fff1f2; border: 1px solid #fecdd3; border-radius: 8px; padding: 0.6rem 0.8rem; font-size: 0.78rem; color: #be123c; margin-top: 0.6rem; }
    .status-badge { font-size: 0.72rem; font-weight: 700; padding: 0.15rem 0.5rem; border-radius: 999px; }
    .status-badge.active-st { background: #dcfce7; color: #15803d; }
    .status-badge.paused-st { background: #fef3c7; color: #92400e; }
    .session-pill-tag { background: #f1f5f9; padding: 0.15rem 0.45rem; border-radius: 6px; font-size: 0.75rem; color: #475569; }
    .outcome-tag { font-size: 0.74rem; font-weight: 600; }
    .outcome-tag.created { color: #15803d; }
    .outcome-tag.empty { color: #64748b; }
    .outcome-tag.error { color: #b91c1c; }

    @media (max-width: 900px) {
      .top-grid { grid-template-columns: 1fr; }
      .audience-grid { grid-template-columns: 1fr; }
      .form-two-cols { grid-template-columns: 1fr; }
      .campaign-filters-panel { padding: 0.8rem; }
      .search-ctrl, .presets-ctrl, .date-range-ctrl { grid-column: span 1; }
      .campaign-kpis-summary-bar { grid-template-columns: repeat(2, 1fr); }
      .campaign-metrics-grid { grid-template-columns: repeat(2, 1fr); }
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
  maxDailyMessagesPerSession: number | null = null;

  tieneLimiteDiarioActivo(): boolean {
    const limit = this.maxDailyMessagesPerSession;
    return Boolean(limit && limit > 0 && (this.contactosResult()?.contacts?.length ?? 0) > 0 && this.selectedSessionIds().length > 0);
  }

  calcularMensajesPorDia(): number {
    const limit = this.maxDailyMessagesPerSession;
    if (!limit || limit <= 0) return 0;
    return this.selectedSessionIds().length * limit;
  }

  calcularDiasDistribucion(): number {
    const total = this.contactosResult()?.contacts?.length ?? 0;
    const sesiones = this.selectedSessionIds().length;
    const limit = this.maxDailyMessagesPerSession;
    if (!limit || limit <= 0 || sesiones === 0 || total === 0) return 1;
    const capacidadDiaria = sesiones * limit;
    return Math.ceil(total / capacidadDiaria);
  }

  readonly ejemploSpintax = signal("");

  tieneSpintax(): boolean {
    const txt = this.messageText;
    return Boolean(txt && txt.includes("{") && txt.includes("|") && txt.includes("}"));
  }

  generarEjemploSpintax(): void {
    const raw = this.messageText || "";
    const withVars = raw.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_m, key) => key === "nombre" ? "Juan" : (key === "nombre_votante" ? "Juan Pérez" : key));
    let result = withVars;
    let iter = 0;
    while (result.includes("{") && result.includes("|") && iter < 15) {
      iter++;
      const prev = result;
      result = result.replace(/\{([^{}]+)\}/g, (match, choicesStr: string) => {
        if (!choicesStr.includes("|")) return match;
        const choices = choicesStr.split("|").map(c => c.trim());
        const randomIndex = Math.floor(Math.random() * choices.length);
        return choices[randomIndex] ?? "";
      });
      if (result === prev) break;
    }
    this.ejemploSpintax.set(result);
  }

  onMessageTextChange(): void {
    if (this.tieneSpintax()) {
      this.generarEjemploSpintax();
    }
  }

  insertarVariable(variable: string): void {
    const etiqueta = `{{${variable}}}`;
    this.messageText = this.messageText ? `${this.messageText} ${etiqueta}` : etiqueta;
    this.onMessageTextChange();
  }

  /* ========================================================= */
  /* CAMPAIGNS LIST & POWERFUL FILTERS STATE                   */
  /* ========================================================= */
  readonly campanias = signal<CampaignRecord[]>([]);
  readonly loadingCampanias = signal(false);

  readonly filtroCampaniaTexto = signal("");
  readonly filtroCampaniaEstado = signal("TODOS");
  readonly filtroCampaniaFechaDesde = signal("");
  readonly filtroCampaniaFechaHasta = signal("");
  readonly filtroCampaniaPreset = signal("TODAS");
  readonly ordenCampanias = signal<"RECIENTES" | "ANTIGUAS" | "MAS_DESTINATARIOS" | "MAS_ENVIADOS" | "NOMBRE">("RECIENTES");
  readonly filasPorPagina = signal(10);
  readonly paginaActual = signal(1);

  readonly campaniasFiltradas = computed<CampaignRecord[]>(() => {
    let list = this.campanias();
    const q = this.filtroCampaniaTexto().trim().toLowerCase();
    const estado = this.filtroCampaniaEstado();
    const desde = this.filtroCampaniaFechaDesde();
    const hasta = this.filtroCampaniaFechaHasta();
    const orden = this.ordenCampanias();

    if (q) {
      list = list.filter((c) =>
        c.name.toLowerCase().includes(q) ||
        (c.jerarquiaResumen && c.jerarquiaResumen.toLowerCase().includes(q)) ||
        c.id.toLowerCase().includes(q),
      );
    }

    if (estado !== "TODOS") {
      if (estado === "COMPLETED_ALL") {
        list = list.filter((c) => c.status === "COMPLETED" || c.status === "COMPLETED_WITH_ERRORS");
      } else {
        list = list.filter((c) => c.status === estado);
      }
    }

    if (desde) {
      const desdeTime = new Date(`${desde}T00:00:00`).getTime();
      list = list.filter((c) => new Date(c.createdAt).getTime() >= desdeTime);
    }

    if (hasta) {
      const hastaTime = new Date(`${hasta}T23:59:59.999`).getTime();
      list = list.filter((c) => new Date(c.createdAt).getTime() <= hastaTime);
    }

    const sorted = [...list];
    if (orden === "RECIENTES") {
      sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } else if (orden === "ANTIGUAS") {
      sorted.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    } else if (orden === "MAS_DESTINATARIOS") {
      sorted.sort((a, b) => b.totalMessages - a.totalMessages);
    } else if (orden === "MAS_ENVIADOS") {
      sorted.sort((a, b) => b.sentMessages - a.sentMessages);
    } else if (orden === "NOMBRE") {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    }

    return sorted;
  });

  readonly totalPaginasCampanias = computed(() => {
    const perPage = this.filasPorPagina();
    if (perPage >= 9999) return 1;
    const count = this.campaniasFiltradas().length;
    return Math.max(1, Math.ceil(count / perPage));
  });

  readonly campaniasPaginadas = computed<CampaignRecord[]>(() => {
    const list = this.campaniasFiltradas();
    const perPage = this.filasPorPagina();
    if (perPage >= 9999) return list;
    const page = Math.min(this.paginaActual(), this.totalPaginasCampanias());
    const start = (page - 1) * perPage;
    return list.slice(start, start + perPage);
  });

  readonly kpisCampaniasFiltradas = computed(() => {
    const list = this.campaniasFiltradas();
    const totalCampanias = list.length;
    let totalDestinatarios = 0;
    let totalEnviados = 0;
    let totalFallidos = 0;

    for (const c of list) {
      totalDestinatarios += (c.totalMessages || 0);
      totalEnviados += (c.sentMessages || 0);
      totalFallidos += (c.failedMessages || 0);
    }

    const procesados = totalEnviados + totalFallidos;
    const porcentajeExito = procesados > 0
      ? Math.round((totalEnviados / procesados) * 100)
      : (totalDestinatarios > 0 && totalEnviados > 0 ? Math.round((totalEnviados / totalDestinatarios) * 100) : 0);

    return {
      totalCampanias,
      totalDestinatarios,
      totalEnviados,
      totalFallidos,
      porcentajeExito,
    };
  });

  porcentajeProgreso(c: CampaignRecord): number {
    if (!c.totalMessages || c.totalMessages === 0) return 0;
    const percent = Math.round((c.sentMessages / c.totalMessages) * 100);
    return Math.min(100, Math.max(0, percent));
  }

  onSearchTextChange(text: string): void {
    this.filtroCampaniaTexto.set(text);
    this.paginaActual.set(1);
  }

  onEstadoChange(st: string): void {
    this.filtroCampaniaEstado.set(st);
    this.paginaActual.set(1);
  }

  onFechaDesdeChange(d: string): void {
    this.filtroCampaniaFechaDesde.set(d);
    this.filtroCampaniaPreset.set("CUSTOM");
    this.paginaActual.set(1);
  }

  onFechaHastaChange(d: string): void {
    this.filtroCampaniaFechaHasta.set(d);
    this.filtroCampaniaPreset.set("CUSTOM");
    this.paginaActual.set(1);
  }

  onFilasPorPaginaChange(val: number): void {
    this.filasPorPagina.set(Number(val));
    this.paginaActual.set(1);
  }

  cambiarPagina(delta: number): void {
    const nueva = this.paginaActual() + delta;
    if (nueva >= 1 && nueva <= this.totalPaginasCampanias()) {
      this.paginaActual.set(nueva);
    }
  }

  aplicarPresetFecha(preset: string): void {
    this.filtroCampaniaPreset.set(preset);
    this.paginaActual.set(1);
    const now = new Date();

    const toIsoDate = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    };

    if (preset === "TODAS") {
      this.filtroCampaniaFechaDesde.set("");
      this.filtroCampaniaFechaHasta.set("");
    } else if (preset === "HOY") {
      const todayStr = toIsoDate(now);
      this.filtroCampaniaFechaDesde.set(todayStr);
      this.filtroCampaniaFechaHasta.set(todayStr);
    } else if (preset === "AYER") {
      const ayer = new Date(now);
      ayer.setDate(ayer.getDate() - 1);
      const ayerStr = toIsoDate(ayer);
      this.filtroCampaniaFechaDesde.set(ayerStr);
      this.filtroCampaniaFechaHasta.set(ayerStr);
    } else if (preset === "7_DIAS") {
      const hace7 = new Date(now);
      hace7.setDate(hace7.getDate() - 7);
      this.filtroCampaniaFechaDesde.set(toIsoDate(hace7));
      this.filtroCampaniaFechaHasta.set(toIsoDate(now));
    } else if (preset === "ESTE_MES") {
      const primerDia = new Date(now.getFullYear(), now.getMonth(), 1);
      this.filtroCampaniaFechaDesde.set(toIsoDate(primerDia));
      this.filtroCampaniaFechaHasta.set(toIsoDate(now));
    }
  }

  limpiarFiltrosCampanias(): void {
    this.filtroCampaniaTexto.set("");
    this.filtroCampaniaEstado.set("TODOS");
    this.filtroCampaniaFechaDesde.set("");
    this.filtroCampaniaFechaHasta.set("");
    this.filtroCampaniaPreset.set("TODAS");
    this.ordenCampanias.set("RECIENTES");
    this.paginaActual.set(1);
  }

  readonly recurrentesJerarquia = signal<RecurringCampaignRecord[]>([]);
  readonly savingRecurring = signal(false);
  readonly busyRecurringIds = signal<Set<string>>(new Set());
  recurringIntervalMinutes = 1440;
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
    const payload: Record<string, unknown> = {
      name: this.name.trim(),
      jerarquiaResumen: this.resumenJerarquiaSeleccion() || undefined,
      sessionIds: this.selectedSessionIds(),
      contacts,
      message: { text: this.messageText },
      mediaAssetId: this.selectedMediaAssetId() || undefined,
      defaultRegion: this.defaultRegion.toUpperCase(),
    };
    if (this.maxDailyMessagesPerSession && this.maxDailyMessagesPerSession > 0) {
      payload["maxDailyMessagesPerSession"] = Number(this.maxDailyMessagesPerSession);
    }

    this.api.createCampaign(payload).subscribe({
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
      PAUSED_BY_CIRCUIT_BREAKER: "PAUSADA SEGURIDAD",
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
