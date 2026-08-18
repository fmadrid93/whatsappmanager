import { Component, OnDestroy, OnInit, computed, inject, signal } from "@angular/core";
import { DatePipe } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ButtonModule } from "primeng/button";
import { CardModule } from "primeng/card";
import { InputTextModule } from "primeng/inputtext";
import { TableModule } from "primeng/table";
import { MessageService } from "primeng/api";
import {
  ApiService,
  type CampaignRecord,
  type CampaignContactValidationResult,
  type CampaignMessageRecord,
  type CampaignPerformanceSnapshot,
  type CampaignRecoverySnapshot,
  type DeadLetterRecord,
  type ExternalConnectorRecord,
  type MediaRecord,
  type SessionRecord,
} from "../core/api.service";
import {
  downloadContactTemplate,
  parseContactFile,
  type ImportedContact,
} from "../shared/contact-file-parser";

@Component({
  standalone: true,
  imports: [FormsModule, DatePipe, ButtonModule, CardModule, InputTextModule, TableModule],
  template: `
    <main class="page">
      <div class="page-header">
        <div>
          <h1>Campañas</h1>
          <div class="muted">Carga manual, CSV/XLSX o API externa; variables por contacto y cola durable.</div>
        </div>
      </div>

      <div class="grid two campaign-grid">
        <p-card header="Nueva campaña">
          <form class="form-grid" (ngSubmit)="createCampaign()">
            <label for="campaign-name">Nombre</label>
            <input pInputText id="campaign-name" name="campaignName" [(ngModel)]="name" />

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

            <label>Destinatarios</label>
            <div class="import-box">
              <div class="row-actions">
                <p-button type="button" label="Descargar plantilla CSV" icon="pi pi-download" severity="secondary" (onClick)="downloadTemplate()" />
                <label class="file-button">
                  <span class="pi pi-file-excel"></span> Cargar CSV o XLSX
                  <input type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" (change)="importContacts($event)" />
                </label>
              </div>

              <div class="api-source-box">
                <strong><i class="pi pi-database"></i> Importar desde otro sistema</strong>
                @if (sourceConnectors().length) {
                  <select [(ngModel)]="selectedSourceConnectorId" name="sourceConnector">
                    <option value="">Selecciona una fuente de contactos</option>
                    @for (connector of sourceConnectors(); track connector.id) {
                      <option [value]="connector.id">{{ connector.name }}</option>
                    }
                  </select>
                  <textarea [(ngModel)]="sourceVariablesJson" name="sourceVariables" rows="3" placeholder='{"reunionId":"123"}'></textarea>
                  <small>Variables JSON para completar la URL o el body del conector.</small>
                  <p-button type="button" label="Consultar e importar" icon="pi pi-cloud-download" severity="help" [loading]="sourceImporting()" [disabled]="!selectedSourceConnectorId" (onClick)="importFromExternalSource()" />
                } @else {
                  <small>No hay fuentes activas. Créala en Integraciones → Conectores con el uso “Fuente de contactos”.</small>
                }
              </div>
              @if (importing()) { <div class="muted">Validando archivo…</div> }
              @if (importedContacts().length || importErrors().length) {
                <div class="import-summary">
                  <strong>{{ importedContacts().length }} registros cargados</strong>
                  <span>{{ duplicateCount() }} duplicados omitidos</span>
                  <span>{{ importErrors().length }} errores</span>
                </div>
                @if (importErrors().length) {
                  <details><summary>Ver errores</summary><div class="error-list">@for (error of importErrors(); track error) { <div>{{ error }}</div> }</div></details>
                }
                @if (importedContacts().length) {
                  <div class="preview-table">
                    @for (contact of importedContacts().slice(0, 8); track contact.sourceRow) {
                      <div><span>{{ contact.name || '—' }}</span><strong>{{ contact.phone }}</strong><small>{{ variableSummary(contact) }}</small></div>
                    }
                    @if (importedContacts().length > 8) { <div class="muted">…y {{ importedContacts().length - 8 }} más.</div> }
                  </div>
                }
              }
            </div>

            <label for="contacts">Carga manual adicional</label>
            <textarea id="contacts" name="contacts" rows="5" [(ngModel)]="contactsText" (ngModelChange)="markContactsDirty()" placeholder="Ana,+59170000001&#10;Luis,70000002"></textarea>
            <div class="contact-help">Una línea: Nombre,Teléfono o Teléfono,Nombre. Se combinará con el archivo sin duplicar.</div>

            <label for="region">País / región por defecto</label>
            <select id="region" name="region" [(ngModel)]="defaultRegion" (ngModelChange)="validateRecipients()">
              @for (region of regionOptions; track region.code) {
                <option [value]="region.code">{{ region.label }}</option>
              }
            </select>
            <div class="contact-help">
              Se usa para normalizar teléfonos locales. Ej.: Paraguay interpreta 0986125168 como +595986125168.
            </div>

            <div class="recipient-validation">
              <div class="recipient-validation-header">
                <div>
                  <strong>Validación de destinatarios</strong>
                  <small>Solo se enviará a números válidos y únicos.</small>
                </div>
                <p-button type="button" label="Validar destinatarios" icon="pi pi-check-circle" severity="secondary"
                  [loading]="validatingContacts()" (onClick)="validateRecipients()" />
              </div>

              @if (contactValidation(); as validation) {
                <div class="validation-summary">
                  <div><span>Recibidos</span><strong>{{ validation.received }}</strong></div>
                  <div class="ok"><span>Se enviarán</span><strong>{{ validation.sendable }}</strong></div>
                  <div class="warn"><span>Inválidos</span><strong>{{ validation.invalid }}</strong></div>
                  <div><span>Duplicados</span><strong>{{ validation.duplicates }}</strong></div>
                </div>

                @if (validation.rejected.length) {
                  <details class="validation-errors">
                    <summary>Ver números inválidos</summary>
                    @for (item of validation.rejected; track item.sourceIndex) {
                      <div><span>{{ item.name || 'Registro ' + item.sourceIndex }}</span><strong>{{ item.phone || '—' }}</strong><small>{{ item.reason }}</small></div>
                    }
                  </details>
                }

                @if (validation.normalizedPreview.length) {
                  <details>
                    <summary>Vista previa de normalización</summary>
                    <div class="normalization-preview">
                      @for (item of validation.normalizedPreview; track item.sourceIndex) {
                        <div><span>{{ item.raw }}</span><i class="pi pi-arrow-right"></i><strong>{{ item.e164 }}</strong></div>
                      }
                    </div>
                  </details>
                }
              } @else {
                <div class="contact-help">Carga los contactos y pulsa “Validar destinatarios”.</div>
              }
            </div>

            <label for="message">Mensaje / plantilla</label>
            <textarea id="message" name="message" rows="5" [(ngModel)]="messageText" [placeholder]="'Hola {{nombre}}, tu saldo es {{saldo}}.'"></textarea>
            <div class="contact-help">Variables disponibles: {{ '{{nombre}}' }}, {{ '{{telefono}}' }} y cualquier columna extra del archivo.</div>

            <label for="media">Multimedia opcional</label>
            <select id="media" name="mediaAssetId" [ngModel]="selectedMediaAssetId()" (ngModelChange)="selectedMediaAssetId.set($event)">
              <option value="">Sin multimedia</option>
              @for (media of mediaItems(); track media.id) {
                <option [value]="media.id">{{ media.fileName }} — {{ media.status }}</option>
              }
            </select>

            @if (selectedMedia(); as media) {
              <div class="selected-media">
                <div class="selected-media-icon"><i [class]="mediaIcon(media)"></i></div>
                <div><strong>{{ media.fileName }}</strong><small>{{ media.mediaKind }} · {{ media.status }}</small></div>
                <button type="button" title="Quitar multimedia" (click)="selectedMediaAssetId.set('')"><i class="pi pi-times"></i></button>
              </div>
            } @else {
              <div class="no-media"><i class="pi pi-image"></i><span>La campaña se enviará sin archivo multimedia.</span></div>
            }

            <label class="check-row consent">
              <input type="checkbox" name="consent" [(ngModel)]="consentConfirmed" />
              Confirmo que los destinatarios autorizaron recibir estos mensajes.
            </label>

            <div class="actions"><p-button type="submit" label="Crear campaña" icon="pi pi-save" [loading]="saving()" /></div>
          </form>
        </p-card>

        <p-card header="Biblioteca multimedia">
          <div class="upload-box">
            <label class="upload-drop">
              <i class="pi pi-cloud-upload"></i>
              <strong>{{ selectedFile?.name || 'Selecciona un archivo' }}</strong>
              <span>Imágenes, video, audio, PDF o texto. Máximo 25 MB.</span>
              <input type="file" accept="image/*,video/*,audio/*,application/pdf,text/plain" (change)="selectFile($event)" />
            </label>
            <p-button label="Subir y seleccionar" icon="pi pi-upload" [disabled]="!selectedFile" [loading]="uploading()" (onClick)="upload()" />
          </div>

          <div class="media-library">
            @for (media of mediaItems(); track media.id) {
              <button type="button" class="media-row" [class.selected]="selectedMediaAssetId() === media.id" (click)="selectedMediaAssetId.set(media.id)">
                <span class="media-kind"><i [class]="mediaIcon(media)"></i></span>
                <span><strong>{{ media.fileName }}</strong><small>{{ media.mediaKind }}</small></span>
                <span class="status-pill">{{ media.status }}</span>
              </button>
            } @empty {
              <div class="empty-library"><i class="pi pi-images"></i><strong>No hay archivos cargados</strong><span>Sube el primero desde el cuadro superior.</span></div>
            }
          </div>
        </p-card>
      </div>

      <p-card header="Campañas registradas" styleClass="campaign-table">
        <p-table [value]="campaigns()" [tableStyle]="{ 'min-width': '1150px' }">
          <ng-template #header><tr><th>Nombre</th><th>Estado</th><th>Multimedia</th><th>Total</th><th>Enviados</th><th>Fallidos/DLQ</th><th>Fecha</th><th>Acciones</th></tr></ng-template>
          <ng-template #body let-campaign><tr>
            <td>{{ campaign.name }}</td>
            <td><span class="status-pill">{{ campaignStatusLabel(campaign.status) }}</span></td>
            <td><span class="media-indicator" [class.with-media]="!!campaign.mediaAssetId"><i [class]="campaign.mediaAssetId ? 'pi pi-paperclip' : 'pi pi-minus'"></i>{{ campaignMediaName(campaign) }}</span></td>
            <td>{{ campaign.totalMessages }}</td><td>{{ campaign.sentMessages }}</td><td>{{ campaign.failedMessages }}</td><td>{{ campaign.createdAt | date:'short' }}</td>
            <td><div class="row-actions">
              <p-button label="Iniciar" size="small" icon="pi pi-play" [disabled]="campaign.status !== 'DRAFT'" (onClick)="start(campaign)" />
              <p-button label="Pausar" size="small" severity="secondary" icon="pi pi-pause" [disabled]="campaign.status !== 'RUNNING' && campaign.status !== 'PREPARING'" (onClick)="pause(campaign)" />
              <p-button label="Reanudar" size="small" severity="secondary" icon="pi pi-refresh" [disabled]="campaign.status !== 'PAUSED' && campaign.status !== 'PAUSED_BY_CIRCUIT_BREAKER'" (onClick)="resume(campaign)" />
              <p-button label="Cancelar" size="small" severity="danger" icon="pi pi-times" [disabled]="campaign.status === 'COMPLETED' || campaign.status === 'COMPLETED_WITH_ERRORS' || campaign.status === 'CANCELLED'" (onClick)="cancel(campaign)" />
              <p-button label="Detalle" size="small" icon="pi pi-list" (onClick)="loadCampaignDetails(campaign)" />
              <p-button label="DLQ" size="small" severity="contrast" icon="pi pi-inbox" (onClick)="loadDeadLetters(campaign)" />
            </div></td>
          </tr></ng-template>
        </p-table>
      </p-card>

      @if (selectedDetailCampaignId()) {
        <p-card header="Detalle de mensajes" styleClass="campaign-table">
          <div class="detail-header">
            <div>
              <strong>{{ selectedDetailCampaignName() }}</strong>
              <div class="muted">Historial persistido de destinatarios y resultados. No necesitas crear otra campaña.</div>
            </div>
            <p-button label="Actualizar" size="small" icon="pi pi-refresh" severity="secondary" [loading]="detailLoading()" (onClick)="refreshCampaignDetails()" />
          </div>

          <div class="performance-panel">
            <div class="performance-title">
              <div>
                <strong>Rendimiento y capacidad en vivo</strong>
                <span>Actualización cada 5 segundos · ventana de velocidad {{ campaignPerformance()?.sampleWindowSeconds ?? 60 }} s.</span>
              </div>
              <span class="capacity-state" [attr.data-state]="campaignPerformance()?.healthStatus ?? 'SIN_SESIONES'">
                {{ capacityStatusLabel() }}
              </span>
            </div>

            <div class="campaign-progress-box">
              <div class="progress-head">
                <div>
                  <span>Avance procesado</span>
                  <strong>{{ campaignPerformance()?.terminal ?? 0 }} / {{ campaignPerformance()?.total ?? campaignMessageTotal() }}</strong>
                </div>
                <strong class="progress-percent">{{ campaignPerformance()?.progressPercent ?? 0 }}%</strong>
              </div>
              <div class="progress-track">
                <span [style.width.%]="campaignPerformance()?.progressPercent ?? 0"></span>
              </div>
              <div class="progress-breakdown">
                <div class="ok"><span>Enviados</span><strong>{{ campaignPerformance()?.sent ?? 0 }}</strong><small>{{ campaignPerformance()?.sentPercent ?? 0 }}%</small></div>
                <div class="processing"><span>En proceso</span><strong>{{ campaignPerformance()?.processing ?? 0 }}</strong><small>{{ campaignPerformance()?.processingPercent ?? 0 }}%</small></div>
                <div><span>Pendientes</span><strong>{{ campaignPerformance()?.pending ?? 0 }}</strong><small>{{ campaignPerformance()?.pendingPercent ?? 0 }}%</small></div>
                <div class="held"><span>Retenidos</span><strong>{{ campaignPerformance()?.held ?? 0 }}</strong><small>{{ campaignPerformance()?.heldPercent ?? 0 }}%</small></div>
                <div class="fail"><span>Fallidos</span><strong>{{ campaignPerformance()?.failed ?? 0 }}</strong><small>{{ campaignPerformance()?.failedPercent ?? 0 }}%</small></div>
                <div class="remaining"><span>Faltan resolver</span><strong>{{ campaignPerformance()?.remaining ?? 0 }}</strong><small>{{ campaignPerformance()?.remainingPercent ?? 0 }}%</small></div>
              </div>
            </div>

            <div class="performance-grid">
              <div><span>Velocidad real</span><strong>{{ campaignPerformance()?.messagesPerMinute ?? 0 }} msg/min</strong></div>
              <div><span>Tiempo estimado</span><strong>{{ etaLabel() }}</strong></div>
              <div><span>Sesiones disponibles</span><strong>{{ campaignPerformance()?.connectedSessions ?? 0 }} / {{ campaignPerformance()?.configuredSessions ?? 0 }}</strong></div>
              <div><span>Workers</span><strong>{{ campaignPerformance()?.activeWorkers ?? 0 }} / {{ campaignPerformance()?.recommendedWorkers ?? 0 }} recomendados</strong></div>
              <div><span>CPU servidor</span><strong>{{ resourcePercent(campaignPerformance()?.server?.cpuPercent) }}</strong></div>
              <div><span>RAM servidor</span><strong>{{ resourcePercent(campaignPerformance()?.server?.memoryUsedPercent) }}</strong></div>
              <div><span>RAM usada</span><strong>{{ memoryLabel() }}</strong></div>
              <div><span>Slots ocupados</span><strong>{{ totalInFlightLabel() }}</strong></div>
              <div><span>Uso de capacidad</span><strong>{{ campaignPerformance()?.slotUsagePercent ?? 0 }}%</strong></div>
              <div><span>Capacidad sesiones</span><strong>{{ campaignPerformance()?.sessionCapacity ?? 0 }} slots</strong></div>
              <div><span>Capacidad Workers</span><strong>{{ campaignPerformance()?.workerCapacity ?? 0 }} slots</strong></div>
              <div><span>Capacidad efectiva</span><strong>{{ campaignPerformance()?.effectiveCapacity ?? 0 }} slots</strong></div>
            </div>

            <div class="capacity-recommendation">
              <i class="pi pi-chart-line"></i>
              <div>
                <strong>{{ capacityStatusLabel() }}</strong>
                <span>{{ campaignPerformance()?.recommendation || 'Esperando métricas de los Workers.' }}</span>
              </div>
            </div>

            @if (campaignPerformance()?.workers?.length) {
              <div class="worker-capacity-table">
                <div class="worker-capacity-head">
                  <strong>Workers activos</strong>
                  <span>CPU/RAM son del proceso Node de cada Worker.</span>
                </div>
                <div class="worker-capacity-row worker-capacity-columns">
                  <span>Worker</span><span>Sesiones</span><span>En vuelo</span><span>Slots</span><span>CPU</span><span>RAM</span>
                </div>
                @for (worker of campaignPerformance()?.workers ?? []; track worker.id) {
                  <div class="worker-capacity-row">
                    <strong>{{ worker.id }}</strong>
                    <span>{{ worker.sessionCount }}</span>
                    <span>{{ worker.inFlight }}</span>
                    <span>{{ worker.slotUsagePercent }}%</span>
                    <span>{{ resourcePercent(worker.processCpuPercent) }}</span>
                    <span>{{ worker.processMemoryMb === null ? '—' : worker.processMemoryMb + ' MB' }}</span>
                  </div>
                }
              </div>
            }

            <div class="performance-note">Los límites 463/cuarentena siguen teniendo prioridad. Estas métricas sirven para dimensionar infraestructura, no para forzar una sesión restringida.</div>
          </div>

          @if (campaignRecovery()) {
            <div class="recovery-panel">
              <div class="recovery-header">
                <div>
                  <strong>Recuperación de campaña</strong>
                  <span>Agrega una sesión conectada y recupera únicamente mensajes varados por fallas técnicas.</span>
                </div>
                <p-button type="button" label="Actualizar recuperación" size="small" icon="pi pi-refresh" severity="secondary" [loading]="recoveryBusy()" (onClick)="refreshCampaignRecovery()" />
              </div>

              <div class="recovery-stats">
                <div><span>Abiertos</span><strong>{{ campaignRecovery()?.openMessages ?? 0 }}</strong></div>
                <div class="recoverable"><span>Recuperables técnicos</span><strong>{{ campaignRecovery()?.recoverableMessages ?? 0 }}</strong></div>
                <div class="held"><span>Retenidos por cuarentena</span><strong>{{ campaignRecovery()?.heldRestrictionMessages ?? 0 }}</strong></div>
                <div><span>En vuelo con lock</span><strong>{{ campaignRecovery()?.inFlightLockedMessages ?? 0 }}</strong></div>
              </div>

              @if ((campaignRecovery()?.heldRestrictionMessages ?? 0) > 0) {
                <div class="recovery-warning">
                  <i class="pi pi-shield"></i>
                  <div>
                    <strong>Protección de cuarentena activa</strong>
                    <span>{{ campaignRecovery()?.policy?.note }}</span>
                  </div>
                </div>
              }

              <div class="recovery-columns">
                <div>
                  <strong>Sesiones de la campaña</strong>
                  <div class="recovery-session-list">
                    @for (session of campaignRecovery()?.configuredSessions ?? []; track session.id) {
                      <div class="recovery-session-row">
                        <span><b>{{ session.name }}</b><small>{{ session.phoneE164 || session.id }}</small></span>
                        <span class="status-pill">{{ session.status }}</span>
                      </div>
                    } @empty {
                      <div class="muted">No hay sesiones habilitadas.</div>
                    }
                  </div>
                </div>

                <div>
                  <strong>Sesiones conectadas para recuperación</strong>
                  <div class="recovery-session-list">
                    @for (session of campaignRecovery()?.candidateSessions ?? []; track session.id) {
                      <label class="recovery-session-row selectable">
                        <input type="checkbox" [checked]="selectedRecoverySessionIds().includes(session.id)" (change)="toggleRecoverySession(session.id)" />
                        <span><b>{{ session.name }}</b><small>{{ session.phoneE164 || session.id }} · {{ session.alreadyConfigured ? 'ya está en la campaña' : 'se agregará' }}</small></span>
                        <span class="status-pill">CONECTADA</span>
                      </label>
                    } @empty {
                      <div class="muted">No hay otra sesión conectada disponible en este momento.</div>
                    }
                  </div>
                </div>
              </div>

              <div class="recovery-actions">
                <p-button type="button" label="Agregar y recuperar pendientes técnicos" icon="pi pi-directions-alt" [loading]="recoveryBusy()" [disabled]="selectedRecoverySessionIds().length === 0" (onClick)="recoverCampaign()" />
                <span>Los enviados, fallidos y retenidos por cuarentena no se reasignan.</span>
              </div>
            </div>
          }

          <div class="detail-summary">
            <div><span>Total</span><strong>{{ campaignPerformance()?.total ?? campaignMessageTotal() }}</strong></div>
            <div><span>Enviados</span><strong>{{ sentDetailCount() }}</strong></div>
            <div><span>Pendientes</span><strong>{{ pendingDetailCount() }}</strong></div>
            <div><span>Retenidos</span><strong>{{ heldDetailCount() }}</strong></div>
            <div><span>Fallidos</span><strong>{{ failedDetailCount() }}</strong></div>
          </div>
          <div class="muted detail-limit-note">El tablero usa los 50.000 registros de la campaña; la tabla inferior muestra hasta 500 mensajes por consulta.</div>

          <div class="detail-filters">
            <button type="button" [class.active]="messageFilter() === 'ALL'" (click)="messageFilter.set('ALL')">Todos</button>
            <button type="button" [class.active]="messageFilter() === 'SENT'" (click)="messageFilter.set('SENT')">Enviados</button>
            <button type="button" [class.active]="messageFilter() === 'PENDING'" (click)="messageFilter.set('PENDING')">Pendientes</button>
            <button type="button" [class.active]="messageFilter() === 'HELD'" (click)="messageFilter.set('HELD')">Retenidos</button>
            <button type="button" [class.active]="messageFilter() === 'FAILED'" (click)="messageFilter.set('FAILED')">Fallidos</button>
          </div>

          <p-table [value]="filteredCampaignMessages()" [loading]="detailLoading()" [tableStyle]="{ 'min-width': '1050px' }">
            <ng-template #header><tr><th>Nombre</th><th>Teléfono</th><th>Sesión actual</th><th>Estado</th><th>Intentos</th><th>Fecha</th><th>Error</th><th>ID WhatsApp</th></tr></ng-template>
            <ng-template #body let-item><tr>
              <td>{{ item.contactName || '—' }}</td>
              <td>{{ item.recipientE164 || item.recipientRaw }}</td>
              <td>{{ sessionDisplay(item.assignedSessionId) }}</td>
              <td><span class="status-pill">{{ messageStatusLabel(item) }}</span></td>
              <td>{{ item.attemptCount }} / {{ item.maxAttempts }}</td>
              <td>{{ messageDate(item) | date:'short' }}</td>
              <td><strong>{{ item.lastErrorCode || '—' }}</strong><div class="muted error-message">{{ item.lastErrorMessage || '' }}</div></td>
              <td class="message-id">{{ item.sentMessageId || '—' }}</td>
            </tr></ng-template>
            <ng-template #emptymessage><tr><td colspan="8"><div class="empty-detail"><i class="pi pi-inbox"></i><strong>No hay mensajes para este filtro</strong><span>Prueba la pestaña “Todos” o pulsa Actualizar.</span></div></td></tr></ng-template>
          </p-table>
        </p-card>
      }

      @if (selectedCampaignId()) {
        <p-card header="Dead Letter Queue" styleClass="campaign-table">
          <div class="muted dlq-title">Campaña: {{ selectedCampaignName() }}</div>
          <p-table [value]="deadLetters()" [tableStyle]="{ 'min-width': '900px' }">
            <ng-template #header><tr><th>Número</th><th>Motivo</th><th>Intentos</th><th>Fecha</th><th>Estado</th><th>Acción</th></tr></ng-template>
            <ng-template #body let-item><tr>
              <td>{{ item.recipientE164 || '—' }}</td><td><strong>{{ item.reasonCode }}</strong><div class="muted">{{ item.reasonMessage }}</div></td><td>{{ item.attemptCount }}</td><td>{{ item.failedAt | date:'short' }}</td><td>{{ item.resolvedAt ? 'RESUELTO' : 'PENDIENTE' }}</td><td><p-button label="Reencolar" size="small" [disabled]="!!item.resolvedAt" (onClick)="requeue(item)" /></td>
            </tr></ng-template>
          </p-table>
        </p-card>
      }
    </main>
  `,
  styles: [`
    .campaign-grid{grid-template-columns:minmax(520px,1.35fr) minmax(320px,.65fr)}.campaign-table{display:block;margin-top:1rem}.session-options{display:grid;gap:.4rem;border:1px solid #d8dee4;padding:.7rem;border-radius:.5rem;max-height:160px;overflow:auto}.check-row{font-weight:400!important;display:flex;gap:.5rem;align-items:center}.import-summary{display:flex;justify-content:space-between;gap:.5rem;padding:.5rem 0;border-bottom:1px solid #edf0f2}.row-actions{display:flex;flex-wrap:wrap;gap:.35rem}.dlq-title{margin-bottom:.75rem}.import-box{border:1px dashed #aeb8c2;border-radius:.6rem;padding:.8rem;display:grid;gap:.6rem}.api-source-box{display:grid;gap:.45rem;padding:.75rem;background:#eff6ff;border:1px solid #bfdbfe;border-radius:.6rem}.api-source-box strong{display:flex;gap:.4rem;align-items:center;color:#1d4ed8}.api-source-box select,.api-source-box textarea{width:100%;border:1px solid #cbd5e1;border-radius:.45rem;padding:.55rem;background:#fff}.api-source-box small{color:#64748b}.file-button{cursor:pointer;display:inline-flex;align-items:center;gap:.4rem;padding:.55rem .8rem;background:#eef2f6;border-radius:.45rem}.file-button input{display:none}.preview-table{display:grid;gap:.3rem;max-height:220px;overflow:auto}.preview-table>div{display:grid;grid-template-columns:1fr 1fr 2fr;gap:.5rem;font-size:.88rem;padding:.3rem;background:#f8fafb}.error-list{color:#b42318;max-height:130px;overflow:auto}.consent{margin-top:.5rem}.selected-media{display:grid;grid-template-columns:auto 1fr auto;gap:.65rem;align-items:center;padding:.75rem;border:1px solid #80b3ff;background:#f2f7ff;border-radius:10px}.selected-media>div:nth-child(2){display:grid}.selected-media small{color:#667085}.selected-media-icon{display:grid;place-items:center;width:38px;height:38px;border-radius:10px;background:#dbeafe;color:#1d4ed8}.selected-media button{border:0;background:transparent;cursor:pointer;color:#667085}.no-media{display:flex;gap:.5rem;align-items:center;color:#667085;background:#f8fafc;border:1px dashed #d8e0e9;border-radius:9px;padding:.65rem}.upload-box{display:grid;gap:.7rem}.upload-drop{min-height:190px;border:2px dashed #aebccc;border-radius:14px;display:grid!important;place-items:center;align-content:center;text-align:center;gap:.45rem;padding:1rem;cursor:pointer;background:#f8fafc;font-weight:400!important}.upload-drop:hover{border-color:#3b82f6;background:#f3f7ff}.upload-drop i{font-size:2rem;color:#2563eb}.upload-drop span{font-size:.82rem;color:#667085}.upload-drop input{display:none}.media-library{display:grid;gap:.45rem;margin-top:1rem;max-height:500px;overflow:auto}.media-row{width:100%;display:grid;grid-template-columns:auto 1fr auto;gap:.6rem;align-items:center;text-align:left;border:1px solid #e2e8f0;background:#fff;border-radius:10px;padding:.65rem;cursor:pointer}.media-row.selected{border-color:#3b82f6;background:#eff6ff}.media-row>span:nth-child(2){display:grid}.media-row small{color:#667085}.media-kind{display:grid;place-items:center;width:34px;height:34px;border-radius:9px;background:#eef2f6;color:#344054}.empty-library{display:grid;place-items:center;text-align:center;gap:.35rem;color:#667085;padding:2rem}.empty-library i{font-size:2rem}.media-indicator{display:inline-flex;align-items:center;gap:.3rem;color:#667085}.media-indicator.with-media{color:#067647}.form-grid select{border:1px solid #cfd8e3;border-radius:8px;padding:.65rem;background:#fff}.detail-header{display:flex;justify-content:space-between;align-items:center;gap:1rem;margin-bottom:1rem}.detail-summary{display:grid;grid-template-columns:repeat(5,minmax(120px,1fr));gap:.7rem;margin-bottom:1rem}.detail-summary>div{display:grid;gap:.25rem;border:1px solid #e2e8f0;border-radius:10px;padding:.75rem;background:#f8fafc}.detail-summary span{font-size:.82rem;color:#667085}.detail-summary strong{font-size:1.25rem}.detail-filters{display:flex;gap:.45rem;flex-wrap:wrap;margin-bottom:.8rem}.detail-filters button{border:1px solid #cbd5e1;background:#fff;border-radius:999px;padding:.45rem .8rem;cursor:pointer}.detail-filters button.active{background:#1d4ed8;color:#fff;border-color:#1d4ed8}.empty-detail{display:grid;place-items:center;gap:.35rem;padding:2rem;color:#667085}.empty-detail i{font-size:1.8rem}.error-message{max-width:360px;white-space:normal}.message-id{max-width:260px;word-break:break-all;font-size:.78rem}.recipient-validation{display:grid;gap:.7rem;border:1px solid #cbd5e1;border-radius:.7rem;padding:.8rem;background:#f8fafc}.recipient-validation-header{display:flex;justify-content:space-between;align-items:center;gap:.7rem}.recipient-validation-header>div{display:grid;gap:.2rem}.recipient-validation-header small{color:#64748b}.validation-summary{display:grid;grid-template-columns:repeat(4,1fr);gap:.5rem}.validation-summary>div{display:grid;gap:.2rem;background:#fff;border:1px solid #e2e8f0;border-radius:.55rem;padding:.55rem}.validation-summary span{font-size:.75rem;color:#64748b}.validation-summary strong{font-size:1.1rem}.validation-summary .ok strong{color:#15803d}.validation-summary .warn strong{color:#b45309}.validation-errors{color:#991b1b}.validation-errors>div{display:grid;grid-template-columns:1fr 1fr 2fr;gap:.5rem;padding:.35rem 0;border-bottom:1px solid #fee2e2}.normalization-preview{display:grid;gap:.3rem;margin-top:.4rem}.normalization-preview>div{display:grid;grid-template-columns:1fr auto 1fr;gap:.5rem;align-items:center;background:#fff;padding:.4rem;border-radius:.45rem}
    .performance-panel{display:grid;gap:.85rem;border:1px solid #bfdbfe;background:#eff6ff;border-radius:12px;padding:.9rem;margin-bottom:1rem}.performance-title{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem}.performance-title>div{display:grid;gap:.2rem}.performance-title span{font-size:.8rem;color:#64748b}.capacity-state{display:inline-flex;align-items:center;border-radius:999px;padding:.38rem .7rem;font-weight:800;font-size:.78rem;white-space:nowrap;background:#fff;border:1px solid #bfdbfe}.capacity-state[data-state="HOLGADO"]{color:#15803d;border-color:#86efac;background:#f0fdf4}.capacity-state[data-state="VIGILAR"]{color:#a16207;border-color:#fde047;background:#fefce8}.capacity-state[data-state="AGREGAR_WORKER"]{color:#1d4ed8;border-color:#93c5fd;background:#eff6ff}.capacity-state[data-state="SERVIDOR_SATURADO"]{color:#b91c1c;border-color:#fca5a5;background:#fef2f2}.campaign-progress-box{display:grid;gap:.65rem;background:#fff;border:1px solid #dbeafe;border-radius:12px;padding:.8rem}.progress-head{display:flex;justify-content:space-between;align-items:end;gap:1rem}.progress-head>div{display:grid;gap:.15rem}.progress-head span{font-size:.78rem;color:#64748b}.progress-percent{font-size:1.5rem}.progress-track{height:12px;border-radius:999px;background:#e2e8f0;overflow:hidden}.progress-track span{display:block;height:100%;min-width:0;border-radius:999px;background:#2563eb;transition:width .3s ease}.progress-breakdown{display:grid;grid-template-columns:repeat(6,minmax(110px,1fr));gap:.45rem}.progress-breakdown>div{display:grid;gap:.1rem;border:1px solid #e2e8f0;border-radius:8px;padding:.5rem;background:#f8fafc}.progress-breakdown span,.progress-breakdown small{font-size:.7rem;color:#64748b}.progress-breakdown strong{font-size:1rem}.progress-breakdown .ok strong{color:#15803d}.progress-breakdown .processing strong{color:#2563eb}.progress-breakdown .held strong{color:#a16207}.progress-breakdown .fail strong{color:#b91c1c}.progress-breakdown .remaining strong{color:#7c3aed}.performance-grid{display:grid;grid-template-columns:repeat(4,minmax(130px,1fr));gap:.55rem}.performance-grid>div{display:grid;gap:.2rem;background:#fff;border:1px solid #dbeafe;border-radius:9px;padding:.65rem}.performance-grid span{font-size:.75rem;color:#64748b}.performance-grid strong{font-size:1.05rem;color:#17212b}.capacity-recommendation{display:flex;gap:.65rem;align-items:flex-start;background:#fff;border:1px solid #dbeafe;border-radius:10px;padding:.7rem}.capacity-recommendation i{margin-top:.1rem;color:#2563eb}.capacity-recommendation>div{display:grid;gap:.15rem}.capacity-recommendation span{font-size:.78rem;color:#475569}.worker-capacity-table{display:grid;border:1px solid #dbeafe;background:#fff;border-radius:10px;overflow:hidden}.worker-capacity-head{display:flex;justify-content:space-between;gap:1rem;padding:.65rem;background:#f8fafc}.worker-capacity-head span{font-size:.75rem;color:#64748b}.worker-capacity-row{display:grid;grid-template-columns:minmax(140px,1.6fr) repeat(5,minmax(75px,.7fr));gap:.5rem;align-items:center;padding:.55rem .65rem;border-top:1px solid #eef2f7;font-size:.78rem}.worker-capacity-columns{font-weight:700;color:#64748b;background:#fbfdff}.performance-note{font-size:.78rem;color:#475569}.detail-limit-note{margin:-.3rem 0 .8rem}
    .recovery-panel{display:grid;gap:.8rem;border:1px solid #cbd5e1;background:#fff;border-radius:12px;padding:.9rem;margin-bottom:1rem}.recovery-header{display:flex;justify-content:space-between;align-items:flex-start;gap:1rem}.recovery-header>div{display:grid;gap:.2rem}.recovery-header span{font-size:.8rem;color:#64748b}.recovery-stats{display:grid;grid-template-columns:repeat(4,minmax(120px,1fr));gap:.5rem}.recovery-stats>div{display:grid;gap:.2rem;border:1px solid #e2e8f0;border-radius:9px;padding:.65rem;background:#f8fafc}.recovery-stats span{font-size:.75rem;color:#64748b}.recovery-stats strong{font-size:1.1rem}.recovery-stats .recoverable strong{color:#1d4ed8}.recovery-stats .held strong{color:#b45309}.recovery-warning{display:flex;gap:.6rem;align-items:flex-start;border:1px solid #fed7aa;background:#fff7ed;border-radius:10px;padding:.7rem;color:#9a3412}.recovery-warning>div{display:grid;gap:.15rem}.recovery-warning span{font-size:.78rem;color:#9a3412}.recovery-columns{display:grid;grid-template-columns:1fr 1fr;gap:.75rem}.recovery-columns>div{display:grid;gap:.45rem}.recovery-session-list{display:grid;gap:.35rem;max-height:210px;overflow:auto}.recovery-session-row{display:grid;grid-template-columns:1fr auto;gap:.55rem;align-items:center;border:1px solid #e2e8f0;border-radius:8px;padding:.55rem;background:#f8fafc}.recovery-session-row.selectable{grid-template-columns:auto 1fr auto;cursor:pointer;background:#fff}.recovery-session-row>span:first-of-type{display:grid;gap:.05rem}.recovery-session-row small{color:#64748b;font-size:.72rem}.recovery-actions{display:flex;align-items:center;gap:.7rem;flex-wrap:wrap}.recovery-actions span{font-size:.76rem;color:#64748b}
    @media(max-width:1000px){.campaign-grid{grid-template-columns:1fr}.detail-summary{grid-template-columns:repeat(2,1fr)}.performance-grid{grid-template-columns:repeat(2,1fr)}.progress-breakdown{grid-template-columns:repeat(3,1fr)}.worker-capacity-row{grid-template-columns:minmax(120px,1.4fr) repeat(5,minmax(60px,.7fr))}.validation-summary{grid-template-columns:repeat(2,1fr)}.recovery-stats{grid-template-columns:repeat(2,1fr)}.recovery-columns{grid-template-columns:1fr}}
  `],
})
export class CampaignsComponent implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly messages = inject(MessageService);
  private performanceTimer?: ReturnType<typeof setInterval>;

  readonly sessions = signal<SessionRecord[]>([]);
  readonly campaigns = signal<CampaignRecord[]>([]);
  readonly mediaItems = signal<MediaRecord[]>([]);
  readonly connectedSessions = signal<SessionRecord[]>([]);
  readonly selectedSessionIds = signal<string[]>([]);
  readonly selectedMediaAssetId = signal("");
  readonly selectedMedia = computed(() => this.mediaItems().find((item) => item.id === this.selectedMediaAssetId()));
  readonly deadLetters = signal<DeadLetterRecord[]>([]);
  readonly campaignMessages = signal<CampaignMessageRecord[]>([]);
  readonly campaignMessageTotal = signal(0);
  readonly campaignPerformance = signal<CampaignPerformanceSnapshot | null>(null);
  readonly campaignRecovery = signal<CampaignRecoverySnapshot | null>(null);
  readonly selectedRecoverySessionIds = signal<string[]>([]);
  readonly recoveryBusy = signal(false);
  readonly selectedDetailCampaignId = signal("");
  readonly selectedDetailCampaignName = signal("");
  readonly detailLoading = signal(false);
  readonly messageFilter = signal<"ALL" | "SENT" | "PENDING" | "HELD" | "FAILED">("ALL");
  readonly filteredCampaignMessages = computed(() => {
    const filter = this.messageFilter();
    const items = this.campaignMessages();
    if (filter === "SENT") return items.filter((item) => item.status === "SENT");
    if (filter === "PENDING") return items.filter((item) => ["PENDING", "PROCESSING"].includes(item.status) && item.lastErrorCode !== "HELD_SESSION_QUARANTINED");
    if (filter === "HELD") return items.filter((item) => item.lastErrorCode === "HELD_SESSION_QUARANTINED");
    if (filter === "FAILED") return items.filter((item) => ["FAILED", "DEAD_LETTER"].includes(item.status));
    return items;
  });
  readonly sentDetailCount = computed(() => this.campaignPerformance()?.sent
    ?? this.campaignMessages().filter((item) => item.status === "SENT").length);
  readonly pendingDetailCount = computed(() => {
    const performance = this.campaignPerformance();
    if (performance) return performance.pending + performance.processing;
    return this.campaignMessages().filter((item) => ["PENDING", "PROCESSING"].includes(item.status) && item.lastErrorCode !== "HELD_SESSION_QUARANTINED").length;
  });
  readonly heldDetailCount = computed(() => this.campaignPerformance()?.held
    ?? this.campaignMessages().filter((item) => item.lastErrorCode === "HELD_SESSION_QUARANTINED").length);
  readonly failedDetailCount = computed(() => this.campaignPerformance()?.failed
    ?? this.campaignMessages().filter((item) => ["FAILED", "DEAD_LETTER"].includes(item.status)).length);
  readonly selectedCampaignId = signal("");
  readonly selectedCampaignName = signal("");
  readonly saving = signal(false);
  readonly uploading = signal(false);
  readonly importing = signal(false);
  readonly sourceImporting = signal(false);
  readonly sourceConnectors = signal<ExternalConnectorRecord[]>([]);
  readonly importedContacts = signal<ImportedContact[]>([]);
  readonly importErrors = signal<string[]>([]);
  readonly duplicateCount = signal(0);
  readonly contactValidation = signal<CampaignContactValidationResult | null>(null);
  readonly validatingContacts = signal(false);
  readonly contactsDirty = signal(true);

  name = "";
  contactsText = "";
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
  messageText = "";
  consentConfirmed = false;
  selectedSourceConnectorId = "";
  sourceVariablesJson = "{}";
  selectedFile?: File;

  ngOnInit(): void {
    this.load();
  }

  ngOnDestroy(): void {
    if (this.performanceTimer) clearInterval(this.performanceTimer);
  }

  load(): void {
    this.api.sessions().subscribe((items) => {
      this.sessions.set(items);
      this.connectedSessions.set(items.filter((item) => item.status === "CONNECTED"));
    });
    this.api.campaigns().subscribe((items) => this.campaigns.set(items));
    this.api.externalConnectors({ purpose: "CONTACT_SOURCE", status: "ACTIVE" }).subscribe({
      next: (items) => this.sourceConnectors.set(items),
      error: () => this.sourceConnectors.set([]),
    });
    this.loadMedia();
  }

  private loadMedia(): void {
    this.api.media().subscribe({
      next: (items) => this.mediaItems.set(items),
      error: (error: { error?: { message?: string } }) => this.messages.add({ severity: "error", summary: "No se pudo cargar la biblioteca", detail: error.error?.message }),
    });
  }

  toggleSession(id: string): void {
    const current = this.selectedSessionIds();
    this.selectedSessionIds.set(current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  downloadTemplate(): void {
    downloadContactTemplate();
  }

  async importContacts(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.importing.set(true);
    try {
      const result = await parseContactFile(file);
      this.importedContacts.set(result.contacts);
      this.importErrors.set(result.errors);
      this.duplicateCount.set(result.duplicates);
      this.markContactsDirty();
      this.messages.add({ severity: result.contacts.length ? "success" : "warn", summary: `${result.contacts.length} registros cargados` });
      this.validateRecipients();
    } catch (error) {
      this.importErrors.set([error instanceof Error ? error.message : "No se pudo leer el archivo."]);
      this.importedContacts.set([]);
    } finally {
      this.importing.set(false);
      input.value = "";
    }
  }

  importFromExternalSource(): void {
    const connectorId = this.selectedSourceConnectorId;
    if (!connectorId) return;
    let variables: Record<string, string>;
    try {
      const parsed: unknown = JSON.parse(this.sourceVariablesJson || "{}");
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Las variables deben ser un objeto JSON.");
      variables = Object.fromEntries(Object.entries(parsed).map(([key, value]) => {
        if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
          throw new Error(`La variable ${key} debe ser texto, número o booleano.`);
        }
        return [key, String(value)];
      }));
    } catch (error) {
      this.messages.add({ severity: "error", summary: "Variables inválidas", detail: error instanceof Error ? error.message : String(error) });
      return;
    }
    this.sourceImporting.set(true);
    this.api.previewExternalContacts(connectorId, variables).subscribe({
      next: (result) => {
        if (result.outcome === "ERROR") {
          this.importedContacts.set([]);
          this.importErrors.set([]);
          this.duplicateCount.set(0);
          this.messages.add({
            severity: "error",
            summary: "La fuente externa respondió con error",
            detail: result.errorMessage || `No se pudo completar la consulta${result.httpStatus ? ` (HTTP ${result.httpStatus})` : ""}.`,
          });
          return;
        }
        const contacts: ImportedContact[] = result.contacts.map((contact, index) => ({
          ...contact,
          sourceRow: index + 1,
        }));
        this.importedContacts.set(contacts);
        this.importErrors.set([...result.errors]);
        this.duplicateCount.set(0);
        this.markContactsDirty();
        this.messages.add({
          severity: contacts.length ? "success" : "warn",
          summary: `${contacts.length} registros recibidos desde la API`,
          detail: `${result.invalid} registros sin teléfono fueron descartados por la fuente.`,
        });
        this.validateRecipients();
      },
      error: (error: { error?: { message?: string } }) => {
        this.messages.add({ severity: "error", summary: "No se pudo importar desde la API", detail: error.error?.message });
        this.sourceImporting.set(false);
      },
      complete: () => this.sourceImporting.set(false),
    });
  }

  markContactsDirty(): void {
    this.contactsDirty.set(true);
    this.contactValidation.set(null);
  }

  private mergedContactsForValidation(): Array<{ name?: string; phone: string; variables?: Record<string, string> }> {
    return [...this.importedContacts(), ...this.manualContacts()]
      .map(({ sourceRow: _sourceRow, ...contact }) => contact);
  }

  validateRecipients(): void {
    const contacts = this.mergedContactsForValidation();
    if (!contacts.length) {
      this.contactValidation.set(null);
      this.contactsDirty.set(true);
      return;
    }

    this.validatingContacts.set(true);
    this.api.validateCampaignContacts({
      contacts,
      defaultRegion: this.defaultRegion.toUpperCase(),
    }).subscribe({
      next: (result) => {
        this.contactValidation.set(result);
        this.contactsDirty.set(false);
        this.duplicateCount.set(result.duplicates);
      },
      error: (error: { error?: { message?: string } }) => {
        this.contactValidation.set(null);
        this.contactsDirty.set(true);
        this.messages.add({ severity: "error", summary: "No se pudieron validar los destinatarios", detail: error.error?.message });
        this.validatingContacts.set(false);
      },
      complete: () => this.validatingContacts.set(false),
    });
  }

  variableSummary(contact: ImportedContact): string {
    return Object.entries(contact.variables || {}).map(([key, value]) => `${key}=${value}`).join(" · ") || "Sin variables extra";
  }

  selectFile(event: Event): void {
    this.selectedFile = (event.target as HTMLInputElement).files?.[0];
  }

  upload(): void {
    if (!this.selectedFile) return;
    this.uploading.set(true);
    this.api.uploadMedia(this.selectedFile).subscribe({
      next: (media) => {
        // Primero agregamos la opción y luego la seleccionamos. Así el <select>
        // no vuelve visualmente a "Sin multimedia".
        this.mediaItems.update((items) => [media, ...items.filter((item) => item.id !== media.id)]);
        this.selectedMediaAssetId.set(media.id);
        this.selectedFile = undefined;
        this.messages.add({ severity: "success", summary: "Archivo subido y seleccionado", detail: media.fileName });
      },
      error: (error: { status?: number; message?: string; error?: { message?: string } | string }) => {
        const apiMessage = typeof error.error === "string" ? error.error : error.error?.message;
        const statusText = error.status ? `HTTP ${error.status}` : "Error de red";
        this.messages.add({
          severity: "error",
          summary: "No se pudo subir el archivo",
          detail: apiMessage || `${statusText}: ${error.message || "revisa el formato y vuelve a intentarlo."}`,
        });
        this.uploading.set(false);
      },
      complete: () => this.uploading.set(false),
    });
  }

  campaignMediaName(campaign: CampaignRecord): string {
    if (!campaign.mediaAssetId) return "Sin multimedia";
    return this.mediaItems().find((item) => item.id === campaign.mediaAssetId)?.fileName || "Multimedia asignada";
  }

  mediaIcon(media: MediaRecord): string {
    return media.mediaKind === "IMAGE" || media.mediaKind === "STICKER"
      ? "pi pi-image"
      : media.mediaKind === "VIDEO"
        ? "pi pi-video"
        : media.mediaKind === "AUDIO"
          ? "pi pi-volume-up"
          : "pi pi-file";
  }

  private manualContacts(): ImportedContact[] {
    const looksLikePhone = (value: string): boolean => /^\+?\d{5,15}$/.test(value.replace(/[\s().-]/g, ""));

    return this.contactsText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line, index) => {
      const comma = line.lastIndexOf(",");
      if (comma < 0) return { phone: line, sourceRow: index + 1 };

      const left = line.slice(0, comma).trim();
      const right = line.slice(comma + 1).trim();
      if (looksLikePhone(left) && !looksLikePhone(right)) {
        return { name: right || undefined, phone: left, sourceRow: index + 1 };
      }
      return { name: left || undefined, phone: right, sourceRow: index + 1 };
    });
  }

  createCampaign(): void {
    if (!this.consentConfirmed) {
      this.messages.add({ severity: "warn", summary: "Confirma la autorización de los destinatarios." });
      return;
    }

    const contacts = this.mergedContactsForValidation();

    if (!contacts.length) {
      this.messages.add({ severity: "warn", summary: "Carga al menos un contacto." });
      return;
    }

    const validation = this.contactValidation();
    if (this.contactsDirty() || !validation) {
      this.messages.add({ severity: "warn", summary: "Valida los destinatarios antes de crear la campaña." });
      this.validateRecipients();
      return;
    }

    if (validation.sendable === 0) {
      this.messages.add({ severity: "error", summary: "No hay destinatarios válidos para enviar." });
      return;
    }

    this.saving.set(true);
    this.api.createCampaign({
      name: this.name,
      sessionIds: this.selectedSessionIds(),
      contacts,
      message: { text: this.messageText },
      mediaAssetId: this.selectedMediaAssetId() || undefined,
      defaultRegion: this.defaultRegion.toUpperCase(),
    }).subscribe({
      next: (created) => {
        this.name = "";
        this.contactsText = "";
        this.messageText = "";
        this.consentConfirmed = false;
        this.importedContacts.set([]);
        this.importErrors.set([]);
        this.contactValidation.set(null);
        this.contactsDirty.set(true);
        this.duplicateCount.set(0);
        this.selectedSourceConnectorId = "";
        this.sourceVariablesJson = "{}";
        this.selectedSessionIds.set([]);
        this.selectedMediaAssetId.set("");
        this.load();
        this.messages.add({ severity: "success", summary: "Campaña creada", detail: created.mediaAssetId ? "Incluye multimedia." : "Sin multimedia." });
      },
      error: (error: { error?: { message?: string } }) => {
        this.messages.add({ severity: "error", summary: "No se pudo crear", detail: error.error?.message });
        this.saving.set(false);
      },
      complete: () => this.saving.set(false),
    });
  }

  start(campaign: CampaignRecord): void { this.api.startCampaign(campaign.id).subscribe(() => this.load()); }
  pause(campaign: CampaignRecord): void { this.api.pauseCampaign(campaign.id).subscribe(() => this.load()); }
  resume(campaign: CampaignRecord): void { this.api.resumeCampaign(campaign.id).subscribe(() => this.load()); }
  cancel(campaign: CampaignRecord): void { this.api.cancelCampaign(campaign.id).subscribe(() => this.load()); }

  loadCampaignDetails(campaign: CampaignRecord): void {
    this.selectedDetailCampaignId.set(campaign.id);
    this.selectedDetailCampaignName.set(campaign.name);
    this.messageFilter.set("ALL");
    this.campaignPerformance.set(null);
    this.campaignRecovery.set(null);
    this.selectedRecoverySessionIds.set([]);
    this.refreshCampaignDetails();

    if (this.performanceTimer) clearInterval(this.performanceTimer);
    this.performanceTimer = setInterval(() => this.refreshCampaignPerformance(), 5000);
  }

  refreshCampaignPerformance(): void {
    const campaignId = this.selectedDetailCampaignId();
    if (!campaignId) return;
    this.api.campaignPerformance(campaignId).subscribe({
      next: (snapshot) => this.campaignPerformance.set(snapshot),
      error: () => this.campaignPerformance.set(null),
    });
  }

  etaLabel(): string {
    const minutes = this.campaignPerformance()?.estimatedMinutesRemaining;
    if (minutes === null || minutes === undefined) return "calculando";
    if (minutes <= 0) return "finalizado";
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest ? `${hours} h ${rest} min` : `${hours} h`;
  }

  capacityStatusLabel(): string {
    const status = this.campaignPerformance()?.healthStatus;
    const labels: Record<string, string> = {
      HOLGADO: "CAPACIDAD SUFICIENTE",
      VIGILAR: "VIGILAR CARGA",
      AGREGAR_WORKER: "AGREGAR WORKER",
      SERVIDOR_SATURADO: "SERVIDOR SATURADO",
      SIN_SESIONES: "SIN SESIONES",
    };
    return status ? labels[status] ?? status : "CALCULANDO";
  }

  resourcePercent(value: number | null | undefined): string {
    return value === null || value === undefined ? "—" : `${value.toFixed(1)}%`;
  }

  memoryLabel(): string {
    const server = this.campaignPerformance()?.server;
    if (!server || server.memoryUsedMb === null || server.memoryTotalMb === null) return "—";
    const usedGb = server.memoryUsedMb / 1024;
    const totalGb = server.memoryTotalMb / 1024;
    return `${usedGb.toFixed(1)} / ${totalGb.toFixed(1)} GB`;
  }

  totalInFlightLabel(): string {
    const perf = this.campaignPerformance();
    if (!perf) return "0 / 0";
    const inFlight = perf.workers.reduce((sum, worker) => sum + worker.inFlight, 0);
    return `${inFlight} / ${perf.effectiveCapacity}`;
  }

  refreshCampaignRecovery(): void {
    const campaignId = this.selectedDetailCampaignId();
    if (!campaignId) return;
    this.recoveryBusy.set(true);
    this.api.campaignRecovery(campaignId).subscribe({
      next: (snapshot) => this.campaignRecovery.set(snapshot),
      error: (error: { error?: { message?: string } }) => {
        this.messages.add({ severity: "error", summary: "No se pudo cargar la recuperación", detail: error.error?.message });
        this.campaignRecovery.set(null);
        this.recoveryBusy.set(false);
      },
      complete: () => this.recoveryBusy.set(false),
    });
  }

  toggleRecoverySession(sessionId: string): void {
    this.selectedRecoverySessionIds.update((current) =>
      current.includes(sessionId)
        ? current.filter((id) => id !== sessionId)
        : [...current, sessionId],
    );
  }

  recoverCampaign(): void {
    const campaignId = this.selectedDetailCampaignId();
    const sessionIds = this.selectedRecoverySessionIds();
    if (!campaignId || sessionIds.length === 0) return;

    this.recoveryBusy.set(true);
    this.api.recoverCampaignTechnicalPending(campaignId, sessionIds).subscribe({
      next: (snapshot) => {
        this.campaignRecovery.set(snapshot);
        this.selectedRecoverySessionIds.set([]);
        const moved = snapshot.lastRecovery?.movedMessages ?? 0;
        const held = snapshot.lastRecovery?.heldRestrictionMessages ?? snapshot.heldRestrictionMessages;
        this.messages.add({
          severity: moved > 0 ? "success" : "warn",
          summary: moved > 0 ? "Recuperación aplicada" : "No había pendientes técnicos para mover",
          detail: held > 0
            ? `${moved} reasignados. ${held} retenidos por cuarentena permanecen en su sesión original.`
            : `${moved} mensajes pendientes fueron reasignados sin tocar los ya enviados.`,
        });
        this.load();
        this.refreshCampaignDetails();
      },
      error: (error: { error?: { message?: string } }) => {
        this.messages.add({ severity: "error", summary: "No se pudo recuperar la campaña", detail: error.error?.message });
        this.recoveryBusy.set(false);
      },
      complete: () => this.recoveryBusy.set(false),
    });
  }

  refreshCampaignDetails(): void {
    const campaignId = this.selectedDetailCampaignId();
    this.refreshCampaignPerformance();
    this.refreshCampaignRecovery();
    if (!campaignId) return;
    this.detailLoading.set(true);
    this.api.campaignMessages(campaignId, undefined, 500, 0).subscribe({
      next: (page) => {
        this.campaignMessages.set(page.items);
        this.campaignMessageTotal.set(page.total);
      },
      error: (error: { error?: { message?: string } }) => {
        this.messages.add({ severity: "error", summary: "No se pudo cargar el detalle", detail: error.error?.message });
        this.campaignMessages.set([]);
        this.campaignMessageTotal.set(0);
        this.detailLoading.set(false);
      },
      complete: () => this.detailLoading.set(false),
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

  sessionDisplay(sessionId?: string): string {
    if (!sessionId) return "Sin sesión";
    const session = this.sessions().find((item) => item.id === sessionId);
    return session ? `${session.name} · ${session.phoneE164 || session.status}` : sessionId;
  }

  messageStatusLabel(item: CampaignMessageRecord): string {
    if (item.lastErrorCode === "HELD_SESSION_QUARANTINED") return "RETENIDO / CUARENTENA";
    if (item.lastErrorCode === "AUTO_FAILOVER_TECHNICAL") return "TRANSFERIDO / PENDIENTE";
    return this.statusLabel(item.status);
  }

  statusLabel(status: string): string {
    const labels: Record<string, string> = {
      PENDING: "PENDIENTE",
      PROCESSING: "PROCESANDO",
      SENT: "ENVIADO",
      FAILED: "FALLIDO",
      DEAD_LETTER: "FALLIDO / DLQ",
      CANCELLED: "CANCELADO",
    };
    return labels[status] ?? status;
  }

  messageDate(item: CampaignMessageRecord): string {
    return item.sentAt ?? item.failedAt ?? item.updatedAt ?? item.createdAt;
  }

  loadDeadLetters(campaign: CampaignRecord): void {
    this.selectedCampaignId.set(campaign.id);
    this.selectedCampaignName.set(campaign.name);
    this.api.deadLetters(campaign.id).subscribe((items) => this.deadLetters.set(items));
  }

  requeue(item: DeadLetterRecord): void {
    this.api.requeueDeadLetter(item.campaignId, item.id).subscribe(() => {
      const id = this.selectedCampaignId();
      if (id) this.api.deadLetters(id).subscribe((items) => this.deadLetters.set(items));
    });
  }
}
