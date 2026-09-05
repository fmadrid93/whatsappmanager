import { Component, OnInit, computed, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { ButtonModule } from "primeng/button";
import { CardModule } from "primeng/card";
import { InputTextModule } from "primeng/inputtext";
import { TableModule } from "primeng/table";
import { MessageService } from "primeng/api";
import {
  ApiService,
  type BotFlowRecord,
  type BotFlowStep,
  type ExternalConnectorRecord,
  type SessionRecord,
} from "../core/api.service";

interface EditableMenuOption {
  value: string;
  label: string;
  nextStepId: string;
}

interface EditableApiMapping {
  sourcePath: string;
  targetVariable: string;
  defaultValue: string;
}

interface EditableStep {
  id: string;
  type: BotFlowStep["type"];
  text: string;
  variable: string;
  operator: "EQUALS" | "CONTAINS" | "EXISTS";
  value: string;
  ifTrueText: string;
  ifFalseText: string;
  invalidText: string;
  options: EditableMenuOption[];
  connectorId: string;
  statusVariable: string;
  apiMappings: EditableApiMapping[];
  successText: string;
  notFoundText: string;
  errorText: string;
}

interface FlowMapRow {
  key: string;
  stepId: string;
  step: EditableStep;
  depth: number;
  viaValue: string;
  viaLabel: string;
  pathLabel: string;
  repeated: boolean;
}

interface FlowGraphNode {
  key: string;
  kind: "START" | "STEP";
  stepId: string;
  step?: EditableStep;
  x: number;
  y: number;
  width: number;
  height: number;
  depth: number;
  pathLabel: string;
}

interface FlowGraphEdge {
  key: string;
  fromId: string;
  toId: string;
  path: string;
  label: string;
  labelX: number;
  labelY: number;
  labelWidth: number;
  branch: boolean;
}

interface FlowGraphLayout {
  nodes: FlowGraphNode[];
  edges: FlowGraphEdge[];
  width: number;
  height: number;
  reachableStepIds: string[];
  endCount: number;
}

function newStep(type: BotFlowStep["type"] = "MESSAGE", id: string = crypto.randomUUID()): EditableStep {
  return {
    id,
    type,
    text: type === "END" ? "Gracias por comunicarte con nosotros." : "",
    variable: "",
    operator: "EQUALS",
    value: "",
    ifTrueText: "",
    ifFalseText: "",
    invalidText: "Opción inválida. Escribe uno de los números indicados.",
    connectorId: "",
    statusVariable: "api_status",
    apiMappings: type === "API_REQUEST" ? [{ sourcePath: "data.valor", targetVariable: "valor", defaultValue: "" }] : [],
    successText: type === "API_REQUEST" ? "Resultado: {{valor}}" : "",
    notFoundText: type === "API_REQUEST" ? "No encontramos información para la consulta." : "",
    errorText: type === "API_REQUEST" ? "En este momento no pudimos consultar la información. Intenta nuevamente más tarde." : "",
    options: type === "MENU"
      ? [
          { value: "1", label: "Opción 1", nextStepId: "" },
          { value: "2", label: "Opción 2", nextStepId: "" },
        ]
      : [],
  };
}


function editableStepFromRecord(step: BotFlowStep): EditableStep {
  const editable = newStep(step.type, step.id);

  if (step.type === "MESSAGE") {
    return { ...editable, text: step.text };
  }

  if (step.type === "QUESTION") {
    return { ...editable, text: step.text, variable: step.variable };
  }

  if (step.type === "MENU") {
    return {
      ...editable,
      text: step.text,
      variable: step.variable,
      invalidText: step.invalidText ?? editable.invalidText,
      options: step.options.map((option) => ({ ...option })),
    };
  }

  if (step.type === "CONDITION") {
    return {
      ...editable,
      variable: step.variable,
      operator: step.operator,
      value: step.value ?? "",
      ifTrueText: step.ifTrueText,
      ifFalseText: step.ifFalseText ?? "",
    };
  }

  if (step.type === "API_REQUEST") {
    return {
      ...editable,
      connectorId: step.connectorId,
      statusVariable: step.statusVariable || "api_status",
      apiMappings: step.mappings.map((mapping) => ({
        sourcePath: mapping.sourcePath,
        targetVariable: mapping.targetVariable,
        defaultValue: mapping.defaultValue ?? "",
      })),
      successText: step.successText ?? "",
      notFoundText: step.notFoundText ?? "",
      errorText: step.errorText ?? "",
    };
  }

  return { ...editable, text: step.text ?? "" };
}

@Component({
  standalone: true,
  imports: [FormsModule, ButtonModule, CardModule, InputTextModule, TableModule],
  template: `
    <main class="page flow-page">
      <div class="page-header flow-header">
        <div>
          <div class="eyebrow">AUTOMATIZACIÓN</div>
          <h1>Constructor de flujos</h1>
          <div class="muted">Diseña recorridos lineales o menús multinivel con destinos entre bloques.</div>
        </div>
        <div class="header-actions">
          <p-button label="Ejemplo básico" icon="pi pi-sparkles" severity="secondary" (onClick)="loadExample()" />
          <p-button label="Ejemplo multinivel" icon="pi pi-sitemap" severity="help" (onClick)="loadMultilevelExample()" />
          <p-button label="Generar flujo recinto por celular + API" icon="pi pi-cloud" severity="success" (onClick)="loadMeetingApiExample()" />
          <p-button label="Plantilla Encuesta / Confirmación PLRA" icon="pi pi-check-square" severity="warn" (onClick)="loadPlraConfirmationExample()" />
          @if (editingFlowId()) {
            <p-button label="Cancelar edición" icon="pi pi-times" severity="secondary" (onClick)="cancelEdit()" />
          }
          <p-button
            [label]="editingFlowId() ? 'Guardar nueva versión' : 'Guardar flujo'"
            icon="pi pi-save"
            [loading]="saving()"
            (onClick)="create()"
          />
        </div>
      </div>

      <p-card header="Plantillas disponibles" styleClass="templates-gallery-card">
        @if (templateFlows().length === 0) {
          <div class="empty-templates">
            <i class="pi pi-bookmark"></i>
            <div>
              <strong>Todavía no guardaste ninguna plantilla.</strong>
              <div class="muted small">Armá un flujo abajo y usá el botón "Guardar como plantilla" en la fila de "Flujos registrados" para que aparezca acá y puedas reutilizarlo con un clic al crear un bot nuevo.</div>
            </div>
          </div>
        } @else {
          <div class="muted" style="margin-bottom:.8rem">Elegí una plantilla para crear un bot nuevo en segundos, reutilizando su guion de conversación.</div>
          <div class="templates-grid">
            @for (tpl of templateFlows(); track tpl.id) {
              <div class="template-card">
                <div class="template-card-head"><i class="pi pi-copy"></i><strong>{{ tpl.name }}</strong></div>
                <div class="muted small">{{ tpl.description || 'Sin descripción' }}</div>
                <div class="template-card-meta">{{ tpl.definition.steps.length }} pasos · {{ triggerLabel(tpl) }}</div>
                @if (cloningFlow()?.id === tpl.id) {
                  <div class="clone-form">
                    <label [attr.for]="'tpl-clone-name-' + tpl.id">Nombre del nuevo bot</label>
                    <input pInputText [id]="'tpl-clone-name-' + tpl.id" name="cloneName" [(ngModel)]="cloneName" [ngModelOptions]="{ standalone: true }" />
                    <label>Sesiones para este bot</label>
                    <div class="session-options">
                      @for (session of sessions(); track session.id) {
                        <label class="session-option" [class.selected]="cloneSessionIds().includes(session.id)">
                          <input type="checkbox" [checked]="cloneSessionIds().includes(session.id)" (change)="toggleCloneSession(session.id)" />
                          <span class="session-dot" [class.connected]="session.status === 'CONNECTED'"></span>
                          <span>{{ session.name }}<small>{{ session.phoneE164 || session.status }}</small></span>
                        </label>
                      } @empty {
                        <div class="muted">No hay sesiones disponibles.</div>
                      }
                    </div>
                    <div class="clone-form-actions">
                      <p-button label="Crear bot desde plantilla" icon="pi pi-check" size="small" [loading]="cloning()" (onClick)="confirmClone()" />
                      <p-button label="Cancelar" size="small" severity="secondary" [text]="true" (onClick)="cancelClone()" />
                    </div>
                  </div>
                } @else {
                  <p-button label="Usar esta plantilla" icon="pi pi-copy" size="small" severity="help" (onClick)="startClone(tpl)" />
                }
              </div>
            }
          </div>
        }
      </p-card>

      <section class="flow-workspace" [class.map-expanded]="mapExpanded()">
        <aside class="panel setup-panel">
          <div class="panel-title"><span class="step-number">1</span><div><strong>Configuración</strong><small>Nombre, disparador y sesiones</small></div></div>

          @if (editingFlowId()) {
            <div class="editing-banner">
              <i class="pi pi-pencil"></i>
              <div>
                <strong>Editando {{ name }} · v{{ editingFlowVersion() }}</strong>
                <small>Al guardar se creará una nueva versión y la anterior quedará como historial.</small>
              </div>
            </div>
          }

          <label for="flow-name">Nombre del flujo</label>
          <input
            pInputText
            id="flow-name"
            name="flowName"
            [(ngModel)]="name"
            [disabled]="!!editingFlowId()"
            placeholder="Atención comercial"
          />
          @if (editingFlowId()) {
            <div class="field-help">El nombre se mantiene para conservar el historial de versiones.</div>
          }

          <label for="flow-description">Descripción</label>
          <textarea id="flow-description" name="flowDescription" rows="3" [(ngModel)]="description" placeholder="Explica para qué sirve este flujo"></textarea>

          <label for="trigger-type">¿Cuándo debe comenzar?</label>
          <select id="trigger-type" name="triggerType" [(ngModel)]="triggerType">
            <option value="ANY">Con cualquier mensaje</option>
            <option value="CONTAINS">Cuando contiene un texto</option>
            <option value="EXACT">Cuando coincide exactamente</option>
          </select>
          @if (triggerType !== 'ANY') {
            <input pInputText name="triggerValue" [(ngModel)]="triggerValue" placeholder="Ej.: menú" />
          }

          <div class="section-divider"></div>
          <label>Sesiones asignadas</label>
          <div class="session-options">
            @for (session of sessions(); track session.id) {
              <label class="session-option" [class.selected]="selectedSessionIds().includes(session.id)">
                <input type="checkbox" [checked]="selectedSessionIds().includes(session.id)" (change)="toggleSession(session.id)" />
                <span class="session-dot" [class.connected]="session.status === 'CONNECTED'"></span>
                <span>
                  <strong>{{ session.name }}</strong>
                  <small>{{ session.phoneE164 || session.status }} · {{ session.isBotActive ? 'Bot activo' : 'Se activará al guardar' }}</small>
                </span>
              </label>
            } @empty {
              <div class="empty-state">Todavía no hay sesiones disponibles.</div>
            }
          </div>
        </aside>

        <section class="panel canvas-panel">
          <div class="canvas-toolbar">
            <div class="panel-title"><span class="step-number">2</span><div><strong>Mapa del flujo</strong><small>{{ steps().length }} bloques · {{ flowMapRows().length }} conexiones visibles</small></div></div>
            <div class="canvas-actions">
              <div class="palette">
                <button type="button" class="palette-button message" (click)="addStep('MESSAGE')"><i class="pi pi-comment"></i> Mensaje</button>
                <button type="button" class="palette-button question" (click)="addStep('QUESTION')"><i class="pi pi-question-circle"></i> Pregunta</button>
                <button type="button" class="palette-button menu" (click)="addStep('MENU')"><i class="pi pi-list"></i> Menú</button>
                <button type="button" class="palette-button api" (click)="addStep('API_REQUEST')"><i class="pi pi-cloud-download"></i> Consultar API</button>
                <button type="button" class="palette-button condition" (click)="addStep('CONDITION')"><i class="pi pi-code"></i> Condición</button>
                <button type="button" class="palette-button end" (click)="addStep('END')"><i class="pi pi-flag"></i> Final</button>
              </div>
              <div class="view-switch" aria-label="Vista del flujo">
                <button type="button" [class.active]="viewMode() === 'MAP'" (click)="setViewMode('MAP')"><i class="pi pi-sitemap"></i> Mapa</button>
                <button type="button" [class.active]="viewMode() === 'LIST'" (click)="setViewMode('LIST')"><i class="pi pi-list"></i> Lista</button>
                <button type="button" [class.active]="mapExpanded()" (click)="toggleMapExpanded()" title="Ampliar u ocultar paneles laterales"><i [class]="mapExpanded() ? 'pi pi-window-minimize' : 'pi pi-window-maximize'"></i></button>
              </div>
            </div>
          </div>

          @if (viewMode() === 'MAP') {
            <div class="flow-map graph-map">
              <div class="graph-toolbar">
                <div class="graph-instructions">
                  <i class="pi pi-info-circle"></i>
                  <span>El flujo se lee de izquierda a derecha. Cada línea muestra exactamente qué opción conduce al siguiente bloque.</span>
                </div>
                <div class="graph-stats">
                  <span><b>{{ flowGraph().nodes.length - 1 }}</b> bloques</span>
                  <span><b>{{ flowGraph().edges.length }}</b> conexiones</span>
                  <span class="finish-stat"><b>{{ flowGraph().endCount }}</b> finales</span>
                </div>
                <div class="zoom-controls" aria-label="Zoom del diagrama">
                  <button type="button" title="Alejar" (click)="zoomOut()"><i class="pi pi-minus"></i></button>
                  <span>{{ zoomPercent() }}%</span>
                  <button type="button" title="Acercar" (click)="zoomIn()"><i class="pi pi-plus"></i></button>
                  <button type="button" title="Restablecer zoom" (click)="resetZoom()"><i class="pi pi-refresh"></i></button>
                </div>
              </div>

              <div class="graph-legend">
                <span><i class="legend-shape start-shape"></i> Inicio</span>
                <span><i class="legend-shape message-shape"></i> Mensaje</span>
                <span><i class="legend-shape menu-shape"></i> Menú</span>
                <span><i class="legend-shape question-shape"></i> Pregunta</span>
                <span><i class="legend-shape condition-shape"></i> Condición</span>
                <span><i class="legend-shape api-shape"></i> API</span>
                <span><i class="legend-shape finish-shape"></i> Fin</span>
              </div>

              <div class="graph-viewport">
                <div
                  class="graph-scaled-area"
                  [style.width.px]="flowGraph().width * graphZoom()"
                  [style.height.px]="flowGraph().height * graphZoom()"
                >
                  <div
                    class="graph-canvas"
                    [style.width.px]="flowGraph().width"
                    [style.height.px]="flowGraph().height"
                    [style.transform]="'scale(' + graphZoom() + ')'"
                  >
                    <svg class="graph-connectors" [attr.width]="flowGraph().width" [attr.height]="flowGraph().height" aria-hidden="true">
                      <defs>
                        <marker id="flow-arrow" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto" markerUnits="strokeWidth">
                          <path d="M0,0 L9,4.5 L0,9 z"></path>
                        </marker>
                      </defs>
                      @for (edge of flowGraph().edges; track edge.key) {
                        <path
                          class="graph-edge"
                          [class.branch-edge]="edge.branch"
                          [attr.d]="edge.path"
                          marker-end="url(#flow-arrow)"
                        ></path>
                        <g class="edge-label" [attr.transform]="'translate(' + edge.labelX + ' ' + edge.labelY + ')'">
                          <rect [attr.x]="-edge.labelWidth / 2" y="-14" [attr.width]="edge.labelWidth" height="28" rx="14"></rect>
                          <text text-anchor="middle" dominant-baseline="middle">{{ edge.label }}</text>
                        </g>
                      }
                    </svg>

                    @for (node of flowGraph().nodes; track node.key) {
                      @if (node.kind === 'START') {
                        <article
                          class="graph-node graph-start-node"
                          [style.left.px]="node.x"
                          [style.top.px]="node.y"
                          [style.width.px]="node.width"
                          [style.height.px]="node.height"
                        >
                          <div class="terminal-symbol play-symbol"><i class="pi pi-play"></i></div>
                          <div><strong>INICIO</strong><small>{{ triggerDescription() }}</small></div>
                        </article>
                      } @else if (node.step; as step) {
                        <article
                          class="graph-node graph-step-node"
                          [class.selected]="selectedStepId() === node.stepId"
                          [class.message-node]="step.type === 'MESSAGE'"
                          [class.question-node]="step.type === 'QUESTION'"
                          [class.menu-node]="step.type === 'MENU'"
                          [class.condition-node]="step.type === 'CONDITION'"
                          [class.api-node]="step.type === 'API_REQUEST'"
                          [class.graph-finish-node]="step.type === 'END'"
                          [style.left.px]="node.x"
                          [style.top.px]="node.y"
                          [style.width.px]="node.width"
                          [style.height.px]="node.height"
                          (click)="selectStep(node.stepId)"
                        >
                          @if (step.type === 'END') {
                            <div class="terminal-symbol finish-symbol"><i class="pi pi-flag"></i></div>
                            <div class="finish-content">
                              <strong>FIN</strong>
                              <small>{{ shortPreview(step) }}</small>
                            </div>
                          } @else {
                            <div class="graph-card-header">
                              <span class="graph-type-icon"><i [class]="stepIcon(step.type)"></i></span>
                              <div>
                                <strong>{{ stepTypeLabel(step.type) }}</strong>
                                <small>Paso {{ stepNumber(node.stepId) }} · Nivel {{ node.depth }}</small>
                              </div>
                              <button type="button" title="Editar bloque" (click)="selectStep(node.stepId); $event.stopPropagation()"><i class="pi pi-pencil"></i></button>
                            </div>
                            <div class="graph-card-preview">{{ shortPreview(step) }}</div>
                            @if (step.type === 'MENU') {
                              <div class="graph-menu-summary">
                                <span><i class="pi pi-list"></i> {{ step.options.length }} opciones</span>
                                <span><i class="pi pi-save"></i> {{ step.variable || 'sin variable' }}</span>
                              </div>
                            }
                            @if (node.pathLabel) {
                              <div class="graph-path" [title]="node.pathLabel"><i class="pi pi-directions"></i> {{ node.pathLabel }}</div>
                            }
                          }
                        </article>
                      }
                    }
                  </div>
                </div>
              </div>

              @if (orphanSteps().length) {
                <section class="orphan-section">
                  <div class="orphan-title"><i class="pi pi-exclamation-triangle"></i><div><strong>Bloques sin conexión</strong><small>No forman parte del recorrido desde INICIO.</small></div></div>
                  <div class="orphan-grid">
                    @for (step of orphanSteps(); track step.id) {
                      <button type="button" (click)="selectStep(step.id)"><i [class]="stepIcon(step.type)"></i><span>Paso {{ stepNumber(step.id) }} · {{ stepTypeLabel(step.type) }}</span><small>{{ shortPreview(step) }}</small></button>
                    }
                  </div>
                </section>
              }
            </div>
          } @else {
            <div class="flow-canvas list-canvas">
              <div class="start-node"><span class="start-dot"></span><strong>Inicio</strong><small>{{ triggerDescription() }}</small></div>
              <div class="connector-line"></div>

              @for (step of steps(); track step.id; let index = $index) {
                <article
                  class="flow-node"
                  [class.selected]="selectedStepId() === step.id"
                  [class.message-node]="step.type === 'MESSAGE'"
                  [class.question-node]="step.type === 'QUESTION'"
                  [class.menu-node]="step.type === 'MENU'"
                  [class.condition-node]="step.type === 'CONDITION'"
                  [class.api-node]="step.type === 'API_REQUEST'"
                  [class.end-node]="step.type === 'END'"
                  (click)="selectStep(step.id)"
                >
                  <div class="node-icon"><i [class]="stepIcon(step.type)"></i></div>
                  <div class="node-content">
                    <div class="node-heading"><span>Paso {{ index + 1 }}</span><strong>{{ stepTypeLabel(step.type) }}</strong></div>
                    <div class="node-preview">{{ stepPreview(step) }}</div>
                    @if ((step.type === 'QUESTION' || step.type === 'MENU') && step.variable) {
                      <div class="node-meta">Guarda en <code>{{ step.variable }}</code></div>
                    }
                    @if (step.type === 'MENU') {
                      <div class="menu-preview">
                        @for (option of step.options; track $index) {
                          <span><b>{{ option.value }}</b> {{ option.label }} <i class="pi pi-arrow-right"></i> {{ stepTargetLabel(option.nextStepId) }}</span>
                        }
                      </div>
                    }
                    @if (step.type === 'API_REQUEST') {
                      <div class="node-meta">Estado en <code>{{ step.statusVariable || 'api_status' }}</code> · {{ step.apiMappings.length }} mapeos</div>
                    }

                    @if (step.type === 'CONDITION') {
                      <div class="branch-preview"><span class="true-branch">Sí: {{ step.ifTrueText || 'Sin respuesta' }}</span><span class="false-branch">No: {{ step.ifFalseText || 'Continúa sin responder' }}</span></div>
                    }
                  </div>
                  <div class="node-actions">
                    <button type="button" title="Subir" [disabled]="index === 0" (click)="moveStep(index, -1); $event.stopPropagation()"><i class="pi pi-arrow-up"></i></button>
                    <button type="button" title="Bajar" [disabled]="index === steps().length - 1" (click)="moveStep(index, 1); $event.stopPropagation()"><i class="pi pi-arrow-down"></i></button>
                    <button type="button" title="Duplicar" (click)="duplicateStep(index); $event.stopPropagation()"><i class="pi pi-copy"></i></button>
                    <button type="button" class="danger" title="Eliminar" (click)="removeStep(index); $event.stopPropagation()"><i class="pi pi-trash"></i></button>
                  </div>
                </article>
                @if (index < steps().length - 1) { <div class="connector-line"></div> }
              } @empty {
                <div class="empty-canvas"><i class="pi pi-sitemap"></i><strong>Tu flujo está vacío</strong><span>Agrega mensajes, preguntas, menús, condiciones o finales.</span></div>
              }
            </div>
          }
        </section>

        <aside class="panel inspector-panel">
          <div class="panel-title"><span class="step-number">3</span><div><strong>Propiedades</strong><small>Edita el bloque seleccionado</small></div></div>

          @if (selectedStep(); as step) {
            <label for="selected-step-type">Tipo de bloque</label>
            <select id="selected-step-type" [ngModel]="step.type" (ngModelChange)="changeSelectedType($event)">
              <option value="MESSAGE">Enviar mensaje</option>
              <option value="QUESTION">Hacer pregunta</option>
              <option value="MENU">Menú con destinos</option>
              <option value="CONDITION">Evaluar condición</option>
              <option value="API_REQUEST">Consultar API externa</option>
              <option value="END">Finalizar flujo</option>
            </select>

            @if (step.type === 'MESSAGE' || step.type === 'QUESTION' || step.type === 'MENU' || step.type === 'END') {
              <label for="selected-step-text">{{ step.type === 'QUESTION' ? 'Pregunta' : step.type === 'MENU' ? 'Texto del menú' : step.type === 'END' ? 'Mensaje final' : 'Mensaje' }}</label>
              <textarea id="selected-step-text" rows="6" [ngModel]="step.text" (ngModelChange)="updateSelected({ text: $event })" placeholder="Escribe el texto que recibirá el usuario"></textarea>
              <div class="field-help">Puedes usar variables como <code>{{ '{{nombre}}' }}</code>.</div>
            }

            @if (step.type === 'QUESTION') {
              <label for="selected-variable">Guardar respuesta en</label>
              <input pInputText id="selected-variable" [ngModel]="step.variable" (ngModelChange)="updateSelected({ variable: $event })" placeholder="nombre" />
            }

            @if (step.type === 'MENU') {
              <label for="menu-variable">Guardar selección en</label>
              <input pInputText id="menu-variable" [ngModel]="step.variable" (ngModelChange)="updateSelected({ variable: $event })" placeholder="menu_principal" />

              <label for="menu-invalid">Respuesta cuando la opción no existe</label>
              <textarea id="menu-invalid" rows="3" [ngModel]="step.invalidText" (ngModelChange)="updateSelected({ invalidText: $event })"></textarea>

              <div class="menu-editor-title"><strong>Opciones y destinos</strong><button type="button" (click)="addMenuOption()"><i class="pi pi-plus"></i> Agregar</button></div>
              <div class="menu-options-editor">
                @for (option of step.options; track $index; let optionIndex = $index) {
                  <div class="menu-option-editor">
                    <div class="menu-option-row">
                      <input pInputText [ngModel]="option.value" (ngModelChange)="updateMenuOption(optionIndex, { value: $event })" placeholder="1" />
                      <input pInputText [ngModel]="option.label" (ngModelChange)="updateMenuOption(optionIndex, { label: $event })" placeholder="Ventas" />
                      <button type="button" title="Eliminar opción" [disabled]="step.options.length <= 2" (click)="removeMenuOption(optionIndex)"><i class="pi pi-trash"></i></button>
                    </div>
                    <select [ngModel]="option.nextStepId" (ngModelChange)="updateMenuOption(optionIndex, { nextStepId: $event })">
                      <option value="">Selecciona el bloque de destino</option>
                      @for (target of steps(); track target.id; let targetIndex = $index) {
                        @if (target.id !== step.id) { <option [value]="target.id">Paso {{ targetIndex + 1 }} · {{ stepTypeLabel(target.type) }} · {{ shortPreview(target) }}</option> }
                      }
                    </select>
                  </div>
                }
              </div>
            }

            @if (step.type === 'API_REQUEST') {
              <label for="api-connector">Conector externo</label>
              <select id="api-connector" [ngModel]="step.connectorId" (ngModelChange)="updateSelected({ connectorId: $event })">
                <option value="">Selecciona un conector de consulta</option>
                @for (connector of botConnectors(); track connector.id) {
                  <option [value]="connector.id">{{ connector.name }} · {{ connector.method }}</option>
                }
              </select>
              @if (!botConnectors().length) {
                <div class="field-help">Primero crea un conector de tipo “Consulta del bot” en Integraciones → Conectores.</div>
              }

              <label for="api-status-variable">Variable de estado</label>
              <input pInputText id="api-status-variable" [ngModel]="step.statusVariable" (ngModelChange)="updateSelected({ statusVariable: $event })" placeholder="api_status" />
              <div class="field-help">Recibirá SUCCESS, NOT_FOUND o ERROR.</div>

              <div class="menu-editor-title"><strong>Mapeo de la respuesta</strong><button type="button" (click)="addApiMapping()"><i class="pi pi-plus"></i> Agregar</button></div>
              <div class="api-mappings-editor">
                @for (mapping of step.apiMappings; track $index; let mappingIndex = $index) {
                  <div class="api-mapping-row">
                    <input pInputText [ngModel]="mapping.sourcePath" (ngModelChange)="updateApiMapping(mappingIndex, { sourcePath: $event })" placeholder="data.colegio" />
                    <input pInputText [ngModel]="mapping.targetVariable" (ngModelChange)="updateApiMapping(mappingIndex, { targetVariable: $event })" placeholder="colegio" />
                    <input pInputText [ngModel]="mapping.defaultValue" (ngModelChange)="updateApiMapping(mappingIndex, { defaultValue: $event })" placeholder="Valor por defecto" />
                    <button type="button" title="Eliminar mapeo" (click)="removeApiMapping(mappingIndex)"><i class="pi pi-trash"></i></button>
                  </div>
                } @empty {
                  <div class="field-help">No hay mapeos. Agrega campos de la respuesta JSON que quieras guardar como variables.</div>
                }
              </div>

              <label for="api-success">Mensaje cuando encuentra información</label>
              <textarea id="api-success" rows="4" [ngModel]="step.successText" (ngModelChange)="updateSelected({ successText: $event })" [placeholder]="'Tu recinto es {{colegio}}.'"></textarea>

              <label for="api-not-found">Mensaje cuando no encuentra información</label>
              <textarea id="api-not-found" rows="3" [ngModel]="step.notFoundText" (ngModelChange)="updateSelected({ notFoundText: $event })"></textarea>

              <label for="api-error">Mensaje cuando la API falla</label>
              <textarea id="api-error" rows="3" [ngModel]="step.errorText" (ngModelChange)="updateSelected({ errorText: $event })"></textarea>
            }

            @if (step.type === 'CONDITION') {
              <label for="condition-variable">Variable a evaluar</label>
              <input pInputText id="condition-variable" [ngModel]="step.variable" (ngModelChange)="updateSelected({ variable: $event })" placeholder="opcion" />

              <label for="condition-operator">Comparación</label>
              <select id="condition-operator" [ngModel]="step.operator" (ngModelChange)="updateSelected({ operator: $event })">
                <option value="EQUALS">Es igual a</option>
                <option value="CONTAINS">Contiene</option>
                <option value="EXISTS">Tiene algún valor</option>
              </select>

              @if (step.operator !== 'EXISTS') {
                <label for="condition-value">Valor esperado</label>
                <input pInputText id="condition-value" [ngModel]="step.value" (ngModelChange)="updateSelected({ value: $event })" placeholder="1" />
              }

              <label for="condition-true">Respuesta si cumple</label>
              <textarea id="condition-true" rows="4" [ngModel]="step.ifTrueText" (ngModelChange)="updateSelected({ ifTrueText: $event })"></textarea>

              <label for="condition-false">Respuesta si no cumple</label>
              <textarea id="condition-false" rows="4" [ngModel]="step.ifFalseText" (ngModelChange)="updateSelected({ ifFalseText: $event })"></textarea>
            }
          } @else {
            <div class="empty-inspector"><i class="pi pi-mouse-pointer"></i><strong>Selecciona un bloque</strong><span>Haz clic sobre un paso para editarlo.</span></div>
          }
        </aside>
      </section>

      <p-card header="Flujos registrados" styleClass="flow-table">
        <p-table [value]="flows()" [tableStyle]="{ 'min-width': '980px' }">
          <ng-template #header><tr><th>Nombre</th><th>Versión</th><th>Disparador</th><th>Pasos</th><th>Sesiones</th><th>Estado</th><th>Acción</th></tr></ng-template>
          <ng-template #body let-flow>
          <tr>
            <td>
              <strong>{{ flow.name }}</strong>
              @if (flow.isTemplate) { <span class="template-pill"><i class="pi pi-copy"></i> Plantilla</span> }
              <div class="muted">{{ flow.description || 'Sin descripción' }}</div>
            </td>
            <td>v{{ flow.version }}</td>
            <td>{{ triggerLabel(flow) }}</td>
            <td>{{ flow.definition.steps.length }}</td>
            <td>{{ flow.sessionIds.length }}</td>
            <td><span class="status-pill" [class.active-pill]="flow.isActive">{{ flow.isActive ? 'ACTIVO' : 'PAUSADO' }}</span></td>
            <td>
              <div class="flow-actions">
                <p-button label="Editar" icon="pi pi-pencil" size="small" severity="info" (onClick)="editFlow(flow)" />
                <p-button [label]="flow.isActive ? 'Pausar' : 'Activar'" size="small" severity="secondary" (onClick)="toggleActive(flow)" />
                @if (flow.isTemplate) {
                  <p-button label="Quitar plantilla" size="small" severity="secondary" [text]="true" (onClick)="toggleTemplate(flow)" />
                } @else {
                  <p-button label="Guardar como plantilla" icon="pi pi-bookmark" size="small" severity="secondary" [text]="true" (onClick)="toggleTemplate(flow)" />
                }
              </div>
            </td>
          </tr>
          </ng-template>
        </p-table>
      </p-card>
    </main>
  `,
  styles: [`
    .templates-gallery-card{margin-bottom:1rem}
    .empty-templates{display:flex;align-items:flex-start;gap:.7rem;background:#faf5ff;border:1px dashed #d8b4fe;border-radius:12px;padding:.85rem 1rem}
    .empty-templates i{color:#9333ea;font-size:1.1rem;margin-top:.15rem}
    .empty-templates strong{color:#334155}
    .templates-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:.85rem}
    .template-card{border:1px solid #e9d5ff;background:#faf5ff;border-radius:14px;padding:.85rem;display:grid;gap:.5rem;align-content:start}
    .template-card-head{display:flex;align-items:center;gap:.5rem;color:#6b21a8}
    .template-card-head i{font-size:1rem}
    .template-card-head strong{color:#0f172a;font-size:.95rem}
    .template-card .small{font-size:.78rem}
    .template-card-meta{font-size:.74rem;color:#7e22ce;font-weight:700}
    .template-card .clone-form{background:#fff;border:1px solid #e3e8ef;border-radius:10px;padding:.6rem;margin-top:.1rem}
    .flow-page{max-width:1800px}.flow-header{align-items:flex-end}.eyebrow{font-size:.72rem;font-weight:800;letter-spacing:.14em;color:#2563eb;margin-bottom:.35rem}.header-actions{display:flex;gap:.55rem;flex-wrap:wrap}.flow-workspace{display:grid;grid-template-columns:minmax(260px,320px) minmax(460px,1fr) minmax(300px,390px);gap:1rem;align-items:start}.panel{background:#fff;border:1px solid #e1e7ee;border-radius:16px;box-shadow:0 8px 26px rgba(15,23,42,.05);padding:1rem}.setup-panel,.inspector-panel{position:sticky;top:1rem;display:grid;gap:.7rem}.panel-title{display:flex;align-items:center;gap:.65rem;margin-bottom:.35rem}.panel-title>div{display:grid;gap:.1rem}.panel-title small{color:#74808c;font-weight:400}.step-number{display:grid;place-items:center;width:30px;height:30px;border-radius:10px;background:#eaf2ff;color:#1d4ed8;font-weight:800}.panel label{font-size:.84rem;font-weight:700;color:#344054;margin-top:.2rem}.panel input,.panel textarea,.panel select{width:100%;border:1px solid #cfd8e3;border-radius:9px;padding:.68rem .72rem;background:#fff}.panel textarea{resize:vertical}.section-divider{height:1px;background:#edf1f5;margin:.35rem 0}.session-options{display:grid;gap:.45rem;max-height:260px;overflow:auto}.session-option{display:grid!important;grid-template-columns:auto auto 1fr;align-items:center;gap:.55rem;padding:.65rem;border:1px solid #e3e8ef;border-radius:10px;font-weight:400!important;cursor:pointer}.session-option.selected{border-color:#8bb8ff;background:#f2f7ff}.session-option>span:last-child{display:grid}.session-option small{color:#74808c}.session-dot{width:9px;height:9px;border-radius:50%;background:#98a2b3}.session-dot.connected{background:#12b76a}.canvas-panel{min-height:720px;padding:0;overflow:hidden}.canvas-toolbar{display:flex;justify-content:space-between;align-items:center;gap:1rem;padding:1rem;border-bottom:1px solid #e7ebf0;flex-wrap:wrap}.palette{display:flex;gap:.4rem;flex-wrap:wrap}.palette-button{border:1px solid #d8e0e9;background:#fff;border-radius:9px;padding:.5rem .65rem;cursor:pointer;display:flex;align-items:center;gap:.38rem;font-weight:700;color:#344054}.palette-button.message i{color:#2563eb}.palette-button.question i{color:#7c3aed}.palette-button.menu i{color:#0891b2}.palette-button.api i{color:#0f766e}.palette-button.condition i{color:#d97706}.palette-button.end i{color:#dc2626}.flow-canvas{min-height:650px;padding:1.5rem;background-image:radial-gradient(#d9e2ec 1px,transparent 1px);background-size:22px 22px;background-color:#f8fafc;display:flex;flex-direction:column;align-items:center}.start-node{min-width:260px;background:#0f172a;color:#fff;border-radius:14px;padding:.8rem 1rem;display:grid;grid-template-columns:auto 1fr;column-gap:.65rem;align-items:center}.start-node small{grid-column:2;color:#cbd5e1}.start-dot{grid-row:1/3;width:16px;height:16px;border:4px solid #86efac;background:#22c55e;border-radius:50%}.connector-line{width:2px;height:28px;background:#b7c3d0;position:relative}.connector-line:after{content:'';position:absolute;bottom:-1px;left:-4px;border-left:5px solid transparent;border-right:5px solid transparent;border-top:7px solid #94a3b8}.flow-node{width:min(760px,100%);display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:.8rem;align-items:start;background:#fff;border:2px solid #e3e8ef;border-radius:15px;padding:.9rem;cursor:pointer;box-shadow:0 6px 18px rgba(15,23,42,.06)}.flow-node.selected{border-color:#3b82f6;box-shadow:0 0 0 4px rgba(59,130,246,.12)}.node-icon{display:grid;place-items:center;width:38px;height:38px;border-radius:11px;background:#eaf2ff;color:#2563eb}.question-node .node-icon{background:#f2eaff;color:#7c3aed}.menu-node .node-icon{background:#e6f8fb;color:#0891b2}.condition-node .node-icon{background:#fff4df;color:#d97706}.api-node .node-icon{background:#ccfbf1;color:#0f766e}.end-node .node-icon{background:#feecec;color:#dc2626}.node-heading{display:flex;gap:.5rem;align-items:center;flex-wrap:wrap}.node-heading span{font-size:.75rem;color:#667085;text-transform:uppercase}.node-preview{margin-top:.35rem;white-space:pre-line;color:#344054}.node-meta{margin-top:.45rem;font-size:.8rem;color:#667085}.menu-preview,.branch-preview{display:grid;gap:.3rem;margin-top:.55rem;font-size:.8rem}.menu-preview span{background:#ecfeff;color:#155e75;padding:.35rem .5rem;border-radius:7px}.branch-preview span{padding:.35rem .5rem;border-radius:7px}.true-branch{background:#ecfdf3;color:#027a48}.false-branch{background:#fff4ed;color:#b54708}.node-actions{display:grid;grid-template-columns:repeat(2,30px);gap:.3rem}.node-actions button,.menu-option-row button,.menu-editor-title button{border:1px solid #d8e0e9;background:#fff;border-radius:8px;cursor:pointer;color:#475467}.node-actions button{width:30px;height:30px}.node-actions button:disabled,.menu-option-row button:disabled{opacity:.35}.node-actions button.danger{color:#d92d20}.field-help{font-size:.78rem;color:#74808c;margin-top:-.35rem}.menu-editor-title{display:flex;justify-content:space-between;align-items:center;margin-top:.45rem}.menu-editor-title button{padding:.4rem .55rem}.menu-options-editor,.api-mappings-editor{display:grid;gap:.65rem}.api-mapping-row{display:grid;grid-template-columns:1.2fr 1fr 1fr 34px;gap:.35rem}.api-mapping-row button{border:1px solid #d8e0e9;background:#fff;border-radius:8px;color:#b42318;cursor:pointer}.menu-option-editor{display:grid;gap:.4rem;border:1px solid #e3e8ef;border-radius:10px;padding:.55rem;background:#f8fafc}.menu-option-row{display:grid;grid-template-columns:65px 1fr 34px;gap:.35rem}.menu-option-row button{width:34px}.empty-canvas,.empty-inspector,.empty-state{display:grid;place-items:center;text-align:center;gap:.35rem;color:#74808c;padding:2rem}.flow-table{display:block;margin-top:1rem}.active-pill{background:#dcfae6;color:#067647}.template-pill{display:inline-flex;align-items:center;gap:.3rem;margin-left:.5rem;background:#f3e8ff;color:#7e22ce;border-radius:999px;padding:.15rem .5rem;font-size:.68rem;font-weight:800}.clone-row td{background:#f8fafc;border-top:0;padding:1rem}.clone-form{display:grid;gap:.5rem;max-width:520px}.clone-form-header{display:flex;align-items:center;gap:.4rem;font-weight:700;color:#334155}.clone-form label{font-size:.84rem;font-weight:700;color:#344054}.clone-form input{border:1px solid #cfd8e3;border-radius:9px;padding:.6rem .7rem}.clone-form-actions{display:flex;gap:.5rem;margin-top:.3rem}.inspector-panel code,.node-meta code{background:#eef2f6;border-radius:5px;padding:.1rem .25rem}.flow-table .muted{font-size:.82rem;margin-top:.2rem}.flow-actions{display:flex;gap:.4rem;align-items:center;flex-wrap:wrap}.editing-banner{display:grid;grid-template-columns:auto 1fr;gap:.55rem;align-items:start;border:1px solid #bfdbfe;background:#eff6ff;color:#1e40af;border-radius:10px;padding:.7rem}.editing-banner i{margin-top:.15rem}.editing-banner>div{display:grid;gap:.15rem}.editing-banner small{color:#475569;font-weight:400}
    .canvas-actions{display:flex;align-items:center;gap:.65rem;flex-wrap:wrap;justify-content:flex-end}.view-switch{display:flex;align-items:center;border:1px solid #d8e0e9;border-radius:10px;padding:.18rem;background:#f8fafc}.view-switch button{border:0;background:transparent;border-radius:8px;padding:.42rem .58rem;cursor:pointer;color:#475467;font-weight:700;display:flex;align-items:center;gap:.35rem}.view-switch button.active{background:#fff;color:#1d4ed8;box-shadow:0 1px 5px rgba(15,23,42,.12)}.flow-workspace.map-expanded{grid-template-columns:minmax(0,1fr)}.flow-workspace.map-expanded>.setup-panel,.flow-workspace.map-expanded>.inspector-panel{display:none}.flow-map{min-height:650px;padding:1rem 1.25rem 2rem;background-image:radial-gradient(#d9e2ec 1px,transparent 1px);background-size:22px 22px;background-color:#f8fafc;overflow:auto}.map-help{display:flex;justify-content:space-between;gap:1rem;align-items:center;background:rgba(255,255,255,.92);border:1px solid #dfe6ee;border-radius:12px;padding:.7rem .85rem;margin-bottom:1rem;color:#475467;font-size:.82rem;position:sticky;top:0;z-index:4;backdrop-filter:blur(6px)}.map-help>div:first-child{display:flex;align-items:center;gap:.45rem}.map-help .pi-info-circle{color:#2563eb}.map-legend{display:flex;gap:.75rem;flex-wrap:wrap}.map-legend span{display:flex;align-items:center;gap:.3rem;white-space:nowrap}.legend-dot{width:9px;height:9px;border-radius:50%;display:inline-block;background:#64748b}.legend-dot.level-1{background:#0891b2}.legend-dot.level-2{background:#7c3aed}.map-start-row,.map-row{display:grid;grid-template-columns:155px minmax(360px,820px);gap:.75rem;align-items:center;position:relative;width:max-content;min-width:min(100%,980px)}.map-start-row{margin-bottom:.75rem}.map-start-card{display:flex;align-items:center;gap:.7rem;background:#0f172a;color:#fff;border-radius:14px;padding:.75rem 1rem;box-shadow:0 7px 18px rgba(15,23,42,.18)}.map-start-card>div{display:grid}.map-start-card small{color:#cbd5e1}.route-pill{justify-self:end;display:flex;align-items:center;gap:.4rem;max-width:155px;background:#e2e8f0;color:#334155;border-radius:999px;padding:.42rem .65rem;font-size:.78rem;font-weight:700;text-align:right}.route-pill b{display:grid;place-items:center;min-width:24px;height:24px;border-radius:50%;background:#0f172a;color:#fff}.entry-pill{background:#dcfce7;color:#166534}.map-tree{display:grid;gap:.75rem}.map-row:not(.root-row)::before{content:'';position:absolute;left:-30px;top:50%;width:30px;border-top:2px solid #94a3b8}.map-row:not(.root-row)::after{content:'';position:absolute;left:-30px;top:-.8rem;height:calc(50% + .8rem);border-left:2px solid #cbd5e1}.map-row.repeated-row::before{border-top-style:dashed}.map-node{position:relative;display:grid;grid-template-columns:5px auto minmax(0,1fr) auto;gap:.75rem;align-items:start;background:#fff;border:2px solid #e3e8ef;border-radius:15px;padding:.8rem .85rem .8rem 0;cursor:pointer;box-shadow:0 6px 18px rgba(15,23,42,.06);overflow:hidden}.map-node:hover{border-color:#a8c6f8;transform:translateY(-1px)}.map-node.selected{border-color:#3b82f6;box-shadow:0 0 0 4px rgba(59,130,246,.12)}.map-node-accent{align-self:stretch;background:#2563eb;border-radius:0 6px 6px 0}.question-node .map-node-accent{background:#7c3aed}.menu-node .map-node-accent{background:#0891b2}.condition-node .map-node-accent{background:#d97706}.end-node .map-node-accent{background:#dc2626}.map-node-content{min-width:0}.map-node-heading{display:flex;justify-content:space-between;gap:.75rem;align-items:center}.map-node-heading>div{display:flex;gap:.35rem;align-items:center;flex-wrap:wrap}.level-badge,.step-badge,.reference-badge{font-size:.68rem;font-weight:800;letter-spacing:.04em;border-radius:999px;padding:.22rem .45rem}.level-badge{background:#eef2f6;color:#475467}.step-badge{background:#eaf2ff;color:#1d4ed8}.reference-badge{background:#f3e8ff;color:#7e22ce}.map-node-preview{margin-top:.35rem;color:#344054;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.map-breadcrumb{margin-top:.4rem;color:#667085;font-size:.76rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.map-routes{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:.35rem;margin-top:.6rem}.map-routes span{display:flex;align-items:center;gap:.35rem;background:#ecfeff;color:#155e75;border:1px solid #bae6fd;border-radius:8px;padding:.35rem .45rem;font-size:.76rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.map-routes span b{display:grid;place-items:center;min-width:22px;height:22px;background:#0891b2;color:#fff;border-radius:6px}.map-routes span.missing-route{background:#fff1f2;color:#be123c;border-color:#fecdd3}.map-node-actions{display:flex;gap:.3rem}.map-node-actions button{width:31px;height:31px;border:1px solid #d8e0e9;background:#fff;border-radius:8px;cursor:pointer;color:#475467}.orphan-section{margin-top:1.25rem;border:1px dashed #f59e0b;background:#fffbeb;border-radius:14px;padding:.85rem}.orphan-title{display:flex;align-items:center;gap:.55rem;color:#92400e}.orphan-title>div{display:grid}.orphan-title small{font-weight:400}.orphan-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:.5rem;margin-top:.7rem}.orphan-grid button{display:grid;grid-template-columns:auto 1fr;gap:.2rem .45rem;text-align:left;border:1px solid #fde68a;background:#fff;border-radius:10px;padding:.6rem;cursor:pointer;color:#78350f}.orphan-grid button small{grid-column:2;color:#92400e;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.list-canvas{min-height:650px}
    .graph-map{padding:0;background:#f8fafc}.graph-toolbar{position:sticky;top:0;z-index:8;display:grid;grid-template-columns:minmax(260px,1fr) auto auto;gap:.8rem;align-items:center;padding:.8rem 1rem;background:rgba(255,255,255,.96);border-bottom:1px solid #dde5ee;backdrop-filter:blur(8px)}.graph-instructions{display:flex;align-items:center;gap:.5rem;color:#475467;font-size:.82rem}.graph-instructions i{color:#2563eb}.graph-stats{display:flex;gap:.45rem;flex-wrap:wrap}.graph-stats span{border:1px solid #dbe3ec;background:#f8fafc;border-radius:999px;padding:.35rem .58rem;font-size:.74rem;color:#475467}.graph-stats b{color:#0f172a}.graph-stats .finish-stat{background:#fff1f2;border-color:#fecdd3;color:#9f1239}.zoom-controls{display:flex;align-items:center;gap:.3rem;border:1px solid #d8e0e9;background:#f8fafc;border-radius:10px;padding:.2rem}.zoom-controls button{width:31px;height:31px;border:0;border-radius:7px;background:#fff;color:#344054;cursor:pointer;box-shadow:0 1px 3px rgba(15,23,42,.08)}.zoom-controls span{min-width:48px;text-align:center;font-size:.74rem;font-weight:800;color:#344054}.graph-legend{display:flex;gap:.8rem;align-items:center;flex-wrap:wrap;padding:.55rem 1rem;background:#fff;border-bottom:1px solid #e6ebf1;color:#667085;font-size:.74rem}.graph-legend span{display:flex;align-items:center;gap:.35rem}.legend-shape{display:inline-block;width:16px;height:10px;border-radius:3px;background:#2563eb}.start-shape{border-radius:999px;background:#16a34a}.menu-shape{background:#0891b2}.question-shape{background:#7c3aed}.condition-shape{background:#d97706}.finish-shape{border-radius:999px;background:#dc2626}.graph-viewport{height:720px;overflow:auto;background-color:#f8fafc;background-image:radial-gradient(#d7e0ea 1px,transparent 1px);background-size:20px 20px}.graph-scaled-area{position:relative;min-width:100%;min-height:100%;padding:1px}.graph-canvas{position:relative;transform-origin:top left}.graph-connectors{position:absolute;inset:0;overflow:visible;pointer-events:none}.graph-edge{fill:none;stroke:#64748b;stroke-width:2.2;opacity:.78}.graph-edge.branch-edge{stroke:#0891b2;stroke-width:2.5}.graph-connectors marker path{fill:#64748b}.edge-label rect{fill:#fff;stroke:#cbd5e1;stroke-width:1;filter:drop-shadow(0 2px 3px rgba(15,23,42,.08))}.edge-label text{font-size:11px;font-weight:800;fill:#334155}.graph-node{position:absolute;box-sizing:border-box;z-index:2}.graph-start-node{display:flex;align-items:center;gap:.7rem;padding:.75rem 1rem;border:2px solid #86efac;background:#f0fdf4;border-radius:999px;box-shadow:0 8px 20px rgba(22,163,74,.13)}.graph-start-node>div:last-child{display:grid;min-width:0}.graph-start-node strong{color:#166534;letter-spacing:.08em}.graph-start-node small{color:#4d7c5d;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.terminal-symbol{display:grid;place-items:center;flex:0 0 auto}.play-symbol{width:38px;height:38px;border-radius:50%;background:#16a34a;color:#fff}.graph-step-node{background:#fff;border:2px solid #dce3eb;border-radius:15px;padding:.75rem;box-shadow:0 8px 22px rgba(15,23,42,.07);cursor:pointer;overflow:hidden;transition:border-color .15s,box-shadow .15s,transform .15s}.graph-step-node:hover{transform:translateY(-2px);border-color:#93b9f8;box-shadow:0 12px 28px rgba(15,23,42,.11)}.graph-step-node.selected{border-color:#2563eb;box-shadow:0 0 0 4px rgba(37,99,235,.13),0 12px 28px rgba(15,23,42,.1)}.graph-step-node.menu-node{border-top:5px solid #0891b2}.graph-step-node.message-node{border-top:5px solid #2563eb}.graph-step-node.question-node{border-top:5px solid #7c3aed}.graph-step-node.condition-node{border-top:5px solid #d97706}.graph-card-header{display:grid;grid-template-columns:auto 1fr auto;gap:.55rem;align-items:center}.graph-card-header>div{display:grid}.graph-card-header small{color:#667085;font-size:.7rem}.graph-card-header button{width:28px;height:28px;border:1px solid #d8e0e9;background:#fff;border-radius:7px;color:#475467;cursor:pointer}.graph-type-icon{display:grid;place-items:center;width:34px;height:34px;border-radius:10px;background:#eaf2ff;color:#2563eb}.menu-node .graph-type-icon{background:#ecfeff;color:#0891b2}.question-node .graph-type-icon{background:#f3e8ff;color:#7c3aed}.condition-node .graph-type-icon{background:#fff7ed;color:#d97706}.api-node .graph-type-icon{background:#ccfbf1;color:#0f766e}.graph-step-node.api-node{border-top:5px solid #0f766e}.graph-card-preview{margin-top:.55rem;color:#344054;font-size:.79rem;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.graph-menu-summary{display:flex;gap:.35rem;flex-wrap:wrap;margin-top:.55rem}.graph-menu-summary span{display:flex;align-items:center;gap:.25rem;background:#ecfeff;color:#155e75;border-radius:999px;padding:.25rem .45rem;font-size:.68rem;font-weight:700}.graph-path{margin-top:.5rem;padding-top:.45rem;border-top:1px dashed #dbe3ec;color:#667085;font-size:.67rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.graph-finish-node{display:flex;align-items:center;gap:.75rem!important;padding:.7rem 1rem!important;border:3px solid #ef4444!important;border-radius:999px!important;background:#fff1f2!important;box-shadow:0 9px 22px rgba(220,38,38,.16)!important}.finish-symbol{width:42px;height:42px;border-radius:50%;background:#dc2626;color:#fff;font-size:1.05rem}.finish-content{display:grid;min-width:0}.finish-content strong{font-size:1rem;letter-spacing:.16em;color:#991b1b}.finish-content small{color:#9f1239;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.graph-finish-node.selected{box-shadow:0 0 0 4px rgba(239,68,68,.15),0 9px 22px rgba(220,38,38,.16)!important}.flow-workspace.map-expanded .graph-viewport{height:calc(100vh - 230px)}
    @media(max-width:1250px){.flow-workspace{grid-template-columns:280px 1fr}.inspector-panel{grid-column:1/-1;position:static}.map-help{align-items:flex-start;flex-direction:column}.graph-toolbar{grid-template-columns:1fr auto}.graph-stats{display:none}}
    @media(max-width:850px){.api-mapping-row{grid-template-columns:1fr}.api-mapping-row button{min-height:34px}.flow-workspace{grid-template-columns:1fr}.setup-panel,.inspector-panel{position:static}.flow-header{align-items:flex-start}.flow-node{grid-template-columns:auto minmax(0,1fr)}.node-actions{grid-column:1/-1;display:flex;justify-content:flex-end}}
  `],
})
export class FlowsComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly messages = inject(MessageService);

  readonly flows = signal<BotFlowRecord[]>([]);
  readonly templateFlows = computed(() => this.flows().filter((f) => f.isTemplate));
  readonly sessions = signal<SessionRecord[]>([]);
  readonly botConnectors = signal<ExternalConnectorRecord[]>([]);
  readonly selectedSessionIds = signal<string[]>([]);
  readonly saving = signal(false);
  readonly editingFlowId = signal<string | null>(null);
  readonly editingFlowVersion = signal<number | null>(null);
  readonly steps = signal<EditableStep[]>([newStep("MESSAGE"), newStep("END")]);
  readonly selectedStepId = signal(this.steps()[0]?.id ?? "");
  readonly selectedStep = computed(() => this.steps().find((step) => step.id === this.selectedStepId()));
  readonly viewMode = signal<"MAP" | "LIST">("MAP");
  readonly mapExpanded = signal(false);
  readonly collapsedStepIds = signal<string[]>([]);
  readonly flowMapRows = computed(() => this.buildFlowMapRows());
  readonly flowGraph = computed(() => this.buildFlowGraph());
  readonly graphZoom = signal(0.82);
  readonly orphanSteps = computed(() => {
    const connectedIds = new Set(this.flowGraph().reachableStepIds);
    return this.steps().filter((step) => !connectedIds.has(step.id));
  });

  readonly cloningFlow = signal<BotFlowRecord | null>(null);
  readonly cloneSessionIds = signal<string[]>([]);
  readonly cloning = signal(false);
  cloneName = "";

  name = "";
  description = "";
  triggerType: "ANY" | "CONTAINS" | "EXACT" = "ANY";
  triggerValue = "";

  ngOnInit(): void { this.load(); }

  load(): void {
    this.api.flows().subscribe({ next: (items) => this.flows.set(items), error: () => this.messages.add({ severity: "error", summary: "No se pudieron cargar los flujos" }) });
    this.api.sessions().subscribe({ next: (items) => this.sessions.set(items), error: () => this.messages.add({ severity: "error", summary: "No se pudieron cargar las sesiones" }) });
    this.api.externalConnectors({ purpose: "BOT_LOOKUP", status: "ACTIVE" }).subscribe({
      next: (items) => this.botConnectors.set(items),
      error: () => this.botConnectors.set([]),
    });
  }

  toggleSession(id: string): void {
    const current = this.selectedSessionIds();
    this.selectedSessionIds.set(current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  selectStep(id: string): void { this.selectedStepId.set(id); }

  setViewMode(mode: "MAP" | "LIST"): void { this.viewMode.set(mode); }

  toggleMapExpanded(): void { this.mapExpanded.update((value) => !value); }

  zoomIn(): void { this.graphZoom.update((value) => Math.min(1.25, Math.round((value + 0.1) * 100) / 100)); }

  zoomOut(): void { this.graphZoom.update((value) => Math.max(0.45, Math.round((value - 0.1) * 100) / 100)); }

  resetZoom(): void { this.graphZoom.set(0.82); }

  zoomPercent(): number { return Math.round(this.graphZoom() * 100); }

  toggleMapNode(stepId: string): void {
    this.collapsedStepIds.update((ids) => ids.includes(stepId) ? ids.filter((id) => id !== stepId) : [...ids, stepId]);
  }

  stepNumber(stepId: string): number {
    const index = this.steps().findIndex((step) => step.id === stepId);
    return index < 0 ? 0 : index + 1;
  }

  private buildFlowGraph(): FlowGraphLayout {
    const steps = this.steps();
    const nodeWidth = 244;
    const nodeHeight = 116;
    const finishWidth = 220;
    const finishHeight = 76;
    const startWidth = 220;
    const startHeight = 76;
    const columnGap = 150;
    const rowGap = 54;
    const marginX = 70;
    const marginY = 70;

    if (!steps.length) {
      return { nodes: [], edges: [], width: 700, height: 420, reachableStepIds: [], endCount: 0 };
    }

    const byId = new Map(steps.map((step) => [step.id, step]));
    const indexById = new Map(steps.map((step, index) => [step.id, index]));
    type Connection = { toId: string; label: string; branch: boolean };
    const connections = new Map<string, Connection[]>();

    const outgoing = (step: EditableStep): Connection[] => {
      if (step.type === "END") return [];
      if (step.type === "MENU") {
        return step.options
          .filter((option) => Boolean(option.nextStepId) && byId.has(option.nextStepId))
          .map((option) => ({
            toId: option.nextStepId,
            label: `${option.value} · ${option.label}`,
            branch: true,
          }));
      }
      const index = indexById.get(step.id);
      const next = index === undefined ? undefined : steps[index + 1];
      return next ? [{ toId: next.id, label: "Continúa", branch: false }] : [];
    };

    for (const step of steps) connections.set(step.id, outgoing(step));

    const reachable = new Set<string>();
    const depthById = new Map<string, number>();
    const firstPathById = new Map<string, string>();
    const queue: Array<{ id: string; depth: number; path: string }> = [{ id: steps[0].id, depth: 1, path: "" }];
    let safety = 0;

    while (queue.length && safety < 10000) {
      safety += 1;
      const current = queue.shift();
      if (!current || !byId.has(current.id)) continue;
      const previousDepth = depthById.get(current.id) ?? 0;
      if (current.depth > previousDepth) depthById.set(current.id, current.depth);
      if (!firstPathById.has(current.id)) firstPathById.set(current.id, current.path);
      const wasReachable = reachable.has(current.id);
      reachable.add(current.id);
      if (wasReachable && current.depth <= previousDepth) continue;
      for (const connection of connections.get(current.id) ?? []) {
        const nextPath = connection.branch
          ? [current.path, connection.label].filter(Boolean).join(" › ")
          : current.path;
        if (current.depth < steps.length + 2) {
          queue.push({ id: connection.toId, depth: current.depth + 1, path: nextPath });
        }
      }
    }

    const childY = new Map<string, number>();
    const visiting = new Set<string>();
    let leafCursor = 0;

    const place = (id: string): number => {
      const existing = childY.get(id);
      if (existing !== undefined) return existing;
      if (visiting.has(id)) {
        const cycleY = leafCursor * (nodeHeight + rowGap);
        leafCursor += 1;
        childY.set(id, cycleY);
        return cycleY;
      }

      visiting.add(id);
      const children = (connections.get(id) ?? []).filter((connection) => reachable.has(connection.toId));
      let y: number;
      if (!children.length) {
        y = leafCursor * (nodeHeight + rowGap);
        leafCursor += 1;
      } else {
        const values = children.map((connection) => place(connection.toId));
        y = values.reduce((sum, value) => sum + value, 0) / values.length;
      }
      visiting.delete(id);
      childY.set(id, y);
      return y;
    };

    place(steps[0].id);

    const stepNodes: FlowGraphNode[] = [...reachable].map((stepId) => {
      const step = byId.get(stepId)!;
      const depth = depthById.get(stepId) ?? 1;
      const isEnd = step.type === "END";
      const width = isEnd ? finishWidth : nodeWidth;
      const height = isEnd ? finishHeight : nodeHeight;
      return {
        key: stepId,
        kind: "STEP",
        stepId,
        step,
        x: marginX + depth * (nodeWidth + columnGap),
        y: marginY + (childY.get(stepId) ?? 0),
        width,
        height,
        depth,
        pathLabel: firstPathById.get(stepId) ?? "",
      };
    });

    const firstNode = stepNodes.find((node) => node.stepId === steps[0].id);
    const startNode: FlowGraphNode = {
      key: "__start__",
      kind: "START",
      stepId: "__start__",
      x: marginX,
      y: firstNode ? firstNode.y + (firstNode.height - startHeight) / 2 : marginY,
      width: startWidth,
      height: startHeight,
      depth: 0,
      pathLabel: "",
    };

    const allNodes = [startNode, ...stepNodes];
    const nodeById = new Map(allNodes.map((node) => [node.stepId, node]));
    const rawEdges: Array<{ fromId: string; toId: string; label: string; branch: boolean }> = [
      { fromId: "__start__", toId: steps[0].id, label: "Comenzar", branch: false },
    ];
    for (const stepId of reachable) {
      for (const connection of connections.get(stepId) ?? []) {
        if (reachable.has(connection.toId)) rawEdges.push({ fromId: stepId, ...connection });
      }
    }

    const edges: FlowGraphEdge[] = rawEdges.flatMap((edge, index) => {
      const from = nodeById.get(edge.fromId);
      const to = nodeById.get(edge.toId);
      if (!from || !to) return [];
      const x1 = from.x + from.width;
      const y1 = from.y + from.height / 2;
      const x2 = to.x;
      const y2 = to.y + to.height / 2;
      const curve = Math.max(55, (x2 - x1) * 0.45);
      const path = `M ${x1} ${y1} C ${x1 + curve} ${y1}, ${x2 - curve} ${y2}, ${x2} ${y2}`;
      const label = edge.label.length > 26 ? `${edge.label.slice(0, 24)}…` : edge.label;
      return [{
        key: `${edge.fromId}-${edge.toId}-${index}`,
        fromId: edge.fromId,
        toId: edge.toId,
        path,
        label,
        labelX: x1 + (x2 - x1) * 0.5,
        labelY: y1 + (y2 - y1) * 0.5,
        labelWidth: Math.min(190, Math.max(78, label.length * 6.7 + 24)),
        branch: edge.branch,
      }];
    });

    const maxRight = Math.max(...allNodes.map((node) => node.x + node.width));
    const maxBottom = Math.max(...allNodes.map((node) => node.y + node.height));

    return {
      nodes: allNodes,
      edges,
      width: Math.max(900, maxRight + marginX),
      height: Math.max(560, maxBottom + marginY),
      reachableStepIds: [...reachable],
      endCount: stepNodes.filter((node) => node.step?.type === "END").length,
    };
  }

  private buildFlowMapRows(): FlowMapRow[] {
    const steps = this.steps();
    if (!steps.length) return [];

    const byId = new Map(steps.map((step) => [step.id, step]));
    const indexById = new Map(steps.map((step, index) => [step.id, index]));
    const expandedIds = new Set<string>();
    const collapsedIds = new Set(this.collapsedStepIds());
    const rows: FlowMapRow[] = [];

    const visit = (
      stepId: string,
      depth: number,
      viaValue: string,
      viaLabel: string,
      pathIds: Set<string>,
      pathLabels: string[],
    ): void => {
      const step = byId.get(stepId);
      if (!step) return;

      const cycle = pathIds.has(stepId);
      const repeated = cycle || expandedIds.has(stepId);
      const key = `${rows.length}-${stepId}-${depth}-${viaValue}`;
      rows.push({
        key,
        stepId,
        step,
        depth,
        viaValue,
        viaLabel,
        pathLabel: pathLabels.join(" › "),
        repeated,
      });

      if (repeated || collapsedIds.has(stepId)) return;
      expandedIds.add(stepId);

      const nextPathIds = new Set(pathIds);
      nextPathIds.add(stepId);

      if (step.type === "MENU") {
        for (const option of step.options) {
          if (!option.nextStepId) continue;
          visit(
            option.nextStepId,
            depth + 1,
            option.value,
            option.label,
            nextPathIds,
            [...pathLabels, option.label],
          );
        }
        return;
      }

      if (step.type === "END") return;

      const index = indexById.get(stepId);
      const nextStep = index === undefined ? undefined : steps[index + 1];
      if (nextStep) {
        visit(nextStep.id, depth, "", "Continúa", nextPathIds, pathLabels);
      }
    };

    visit(steps[0].id, 0, "", "Primer bloque", new Set<string>(), []);
    return rows;
  }

  addStep(type: BotFlowStep["type"]): void {
    const created = newStep(type);
    this.steps.update((items) => [...items, created]);
    this.selectedStepId.set(created.id);
  }

  removeStep(index: number): void {
    const removed = this.steps()[index];
    this.steps.update((items) => items.filter((_item, currentIndex) => currentIndex !== index));
    if (removed) this.collapsedStepIds.update((ids) => ids.filter((id) => id !== removed.id));
    this.steps.update((items) => items.map((step) => step.type === "MENU" ? {
      ...step,
      options: step.options.map((option) => option.nextStepId === removed?.id ? { ...option, nextStepId: "" } : option),
    } : step));
    if (removed?.id === this.selectedStepId()) {
      const remaining = this.steps();
      this.selectedStepId.set(remaining[Math.min(index, remaining.length - 1)]?.id ?? "");
    }
  }

  moveStep(index: number, direction: -1 | 1): void {
    const target = index + direction;
    const current = [...this.steps()];
    if (target < 0 || target >= current.length) return;
    [current[index], current[target]] = [current[target], current[index]];
    this.steps.set(current);
  }

  duplicateStep(index: number): void {
    const source = this.steps()[index];
    if (!source) return;
    const copy = { ...source, id: crypto.randomUUID(), options: source.options.map((option) => ({ ...option })), apiMappings: source.apiMappings.map((mapping) => ({ ...mapping })) };
    this.steps.update((items) => [...items.slice(0, index + 1), copy, ...items.slice(index + 1)]);
    this.selectedStepId.set(copy.id);
  }

  updateSelected(patch: Partial<EditableStep>): void {
    const id = this.selectedStepId();
    this.steps.update((items) => items.map((step) => step.id === id ? { ...step, ...patch } : step));
  }

  changeSelectedType(type: BotFlowStep["type"]): void {
    const current = this.selectedStep();
    const defaults = newStep(type, current?.id);
    this.updateSelected({
      type,
      text: current?.text || defaults.text,
      variable: type === "QUESTION" || type === "MENU" || type === "CONDITION" ? current?.variable || "" : "",
      operator: type === "CONDITION" ? current?.operator || "EQUALS" : "EQUALS",
      value: type === "CONDITION" ? current?.value || "" : "",
      ifTrueText: type === "CONDITION" ? current?.ifTrueText || "" : "",
      ifFalseText: type === "CONDITION" ? current?.ifFalseText || "" : "",
      invalidText: type === "MENU" ? current?.invalidText || defaults.invalidText : "",
      options: type === "MENU" ? (current?.options.length ? current.options : defaults.options) : [],
      connectorId: type === "API_REQUEST" ? current?.connectorId || "" : "",
      statusVariable: type === "API_REQUEST" ? current?.statusVariable || "api_status" : "api_status",
      apiMappings: type === "API_REQUEST" ? (current?.apiMappings.length ? current.apiMappings : defaults.apiMappings) : [],
      successText: type === "API_REQUEST" ? current?.successText || defaults.successText : "",
      notFoundText: type === "API_REQUEST" ? current?.notFoundText || defaults.notFoundText : "",
      errorText: type === "API_REQUEST" ? current?.errorText || defaults.errorText : "",
    });
  }

  addMenuOption(): void {
    const step = this.selectedStep();
    if (!step || step.type !== "MENU" || step.options.length >= 10) return;
    this.updateSelected({ options: [...step.options, { value: String(step.options.length + 1), label: `Opción ${step.options.length + 1}`, nextStepId: "" }] });
  }

  updateMenuOption(index: number, patch: Partial<EditableMenuOption>): void {
    const step = this.selectedStep();
    if (!step || step.type !== "MENU") return;
    this.updateSelected({ options: step.options.map((option, currentIndex) => currentIndex === index ? { ...option, ...patch } : option) });
  }

  removeMenuOption(index: number): void {
    const step = this.selectedStep();
    if (!step || step.type !== "MENU" || step.options.length <= 2) return;
    this.updateSelected({ options: step.options.filter((_option, currentIndex) => currentIndex !== index) });
  }

  addApiMapping(): void {
    const step = this.selectedStep();
    if (!step || step.type !== "API_REQUEST" || step.apiMappings.length >= 30) return;
    this.updateSelected({ apiMappings: [...step.apiMappings, { sourcePath: "", targetVariable: "", defaultValue: "" }] });
  }

  updateApiMapping(index: number, patch: Partial<EditableApiMapping>): void {
    const step = this.selectedStep();
    if (!step || step.type !== "API_REQUEST") return;
    this.updateSelected({ apiMappings: step.apiMappings.map((mapping, currentIndex) => currentIndex === index ? { ...mapping, ...patch } : mapping) });
  }

  removeApiMapping(index: number): void {
    const step = this.selectedStep();
    if (!step || step.type !== "API_REQUEST") return;
    this.updateSelected({ apiMappings: step.apiMappings.filter((_mapping, currentIndex) => currentIndex !== index) });
  }

  editFlow(flow: BotFlowRecord): void {
    const editableSteps = flow.definition.steps.map((step) => editableStepFromRecord(step));

    this.editingFlowId.set(flow.id);
    this.editingFlowVersion.set(flow.version);
    this.name = flow.name;
    this.description = flow.description ?? "";
    this.triggerType = flow.definition.trigger.type;
    this.triggerValue = flow.definition.trigger.value ?? "";
    this.selectedSessionIds.set([...flow.sessionIds]);
    this.steps.set(editableSteps.length ? editableSteps : [newStep("MESSAGE"), newStep("END")]);
    this.selectedStepId.set(this.steps()[0]?.id ?? "");
    this.viewMode.set("MAP");
    this.collapsedStepIds.set([]);
    this.graphZoom.set(0.82);
    this.mapExpanded.set(false);

    window.scrollTo({ top: 0, behavior: "smooth" });
    this.messages.add({
      severity: "info",
      summary: "Flujo cargado para edición",
      detail: `${flow.name} · v${flow.version}. Al guardar se creará una nueva versión.`,
    });
  }

  cancelEdit(): void {
    const wasEditing = this.editingFlowId();
    this.resetEditor();
    if (wasEditing) {
      this.messages.add({ severity: "info", summary: "Edición cancelada" });
    }
  }

  loadExample(): void {
    const example: EditableStep[] = [
      { ...newStep("MESSAGE"), text: "¡Hola! 👋 Bienvenido a nuestra atención automática." },
      { ...newStep("QUESTION"), text: "Antes de continuar, ¿cuál es tu nombre?", variable: "nombre" },
      { ...newStep("MESSAGE"), text: "Mucho gusto, {{nombre}}. Escribe 1 para Ventas o 2 para Soporte." },
      { ...newStep("QUESTION"), text: "¿Qué opción eliges?", variable: "opcion" },
      { ...newStep("CONDITION"), variable: "opcion", operator: "EQUALS", value: "1", ifTrueText: "Un asesor de ventas continuará con tu atención.", ifFalseText: "Te derivaremos a soporte." },
      { ...newStep("END"), text: "Gracias por comunicarte con nosotros." },
    ];
    this.loadExampleIntoEditor("Atención comercial", "Ejemplo básico de bienvenida y derivación.", example);
  }

  loadMultilevelExample(): void {
    const greeting = { ...newStep("MESSAGE"), text: "¡Hola! 👋 Soy tu asistente virtual. Selecciona una opción para ayudarte." };
    const main = newStep("MENU");
    main.text = "MENÚ PRINCIPAL\n\n1. Ventas\n2. Soporte técnico\n3. Facturación\n4. Estado de pedidos\n5. Hablar con un asesor";
    main.variable = "menu_principal";

    const categories = [
      { value: "1", label: "Ventas", variable: "ventas", sub: [["Productos", ["Ropa", "Accesorios"]], ["Cotización", ["Mayorista", "Minorista"]]] },
      { value: "2", label: "Soporte técnico", variable: "soporte", sub: [["Internet", ["Sin conexión", "Internet lento"]], ["Aplicación", ["No inicia", "Error de acceso"]]] },
      { value: "3", label: "Facturación", variable: "facturacion", sub: [["Factura", ["Solicitar factura", "Corregir datos"]], ["Pago", ["Pago pendiente", "Pago duplicado"]]] },
      { value: "4", label: "Estado de pedidos", variable: "pedidos", sub: [["Seguimiento", ["En preparación", "En camino"]], ["Cambios", ["Cambiar dirección", "Cancelar pedido"]]] },
      { value: "5", label: "Hablar con un asesor", variable: "asesor", sub: [["Área comercial", ["Compra nueva", "Renovación"]], ["Área técnica", ["Incidente", "Configuración"]]] },
    ] as const;

    const all: EditableStep[] = [greeting, main];
    const mainOptions: EditableMenuOption[] = [];

    for (const category of categories) {
      const level2 = newStep("MENU");
      level2.variable = `submenu_${category.variable}`;
      level2.text = `${category.label.toUpperCase()}\n\n1. ${category.sub[0][0]}\n2. ${category.sub[1][0]}`;
      all.push(level2);
      mainOptions.push({ value: category.value, label: category.label, nextStepId: level2.id });

      const level2Options: EditableMenuOption[] = [];
      category.sub.forEach((sub, subIndex) => {
        const level3 = newStep("MENU");
        level3.variable = `detalle_${category.variable}_${subIndex + 1}`;
        level3.text = `${sub[0].toUpperCase()}\n\n1. ${sub[1][0]}\n2. ${sub[1][1]}`;
        all.push(level3);
        level2Options.push({ value: String(subIndex + 1), label: sub[0], nextStepId: level3.id });

        const ends = sub[1].map((detail, detailIndex) => {
          const end = newStep("END");
          end.text = `Seleccionaste: ${category.label} → ${sub[0]} → ${detail}.\n\nRegistramos tu solicitud. Un asesor continuará con la atención.`;
          all.push(end);
          return { value: String(detailIndex + 1), label: detail, nextStepId: end.id };
        });
        level3.options = ends;
      });
      level2.options = level2Options;
    }
    main.options = mainOptions;
    this.loadExampleIntoEditor("Bot multinivel de atención", "Menú de tres niveles: 5 áreas, subopciones y subsubopciones.", all);
  }

  loadMeetingApiExample(): void {
    const activeConnectors = this.botConnectors().filter((connector) => connector.status === "ACTIVE");
    const lookupConnector = activeConnectors.find((connector) =>
      connector.method === "GET" && /(recinto|colegio|vot|consulta|ubicacion|ubicación)/i.test(connector.name),
    ) ?? activeConnectors.find((connector) => connector.method === "GET");

    const welcome = {
      ...newStep("MESSAGE"),
      text: "Voy a consultar tu recinto usando automáticamente el número de WhatsApp desde el que estás escribiendo.",
    };

    const lookup = {
      ...newStep("API_REQUEST"),
      connectorId: lookupConnector?.id ?? "",
      statusVariable: "consulta_recinto_estado",
      apiMappings: [
        { sourcePath: "dato[0].idRecinto", targetVariable: "id_recinto", defaultValue: "" },
        { sourcePath: "dato[0].recintoVotacion", targetVariable: "recinto_votacion", defaultValue: "" },
        { sourcePath: "dato[0].recinto", targetVariable: "recinto", defaultValue: "" },
        { sourcePath: "dato[0].latitud", targetVariable: "latitud", defaultValue: "" },
        { sourcePath: "dato[0].longitud", targetVariable: "longitud", defaultValue: "" },
        { sourcePath: "dato[0].celular", targetVariable: "celular_resultado", defaultValue: "" },
      ],
      successText: "Encontré tu recinto para el celular {{celular}}:\n\n🏫 Recinto: {{recinto}}\n📍 Ubicación: {{latitud}}, {{longitud}}\n🗺️ Google Maps: {{mapa_url}}",
      notFoundText: "No encontramos un recinto asociado al celular {{celular}}.",
      errorText: "En este momento no pudimos consultar tu recinto. Puedes intentar nuevamente en unos minutos.",
    };

    const retryMenu = newStep("MENU");
    retryMenu.text = "¿Qué deseas hacer?\n\n1. Consultar nuevamente\n2. Finalizar";
    retryMenu.variable = "accion_recinto";
    retryMenu.invalidText = "Opción inválida. Escribe 1 o 2.";

    const exitEnd = {
      ...newStep("END"),
      text: "Gracias por comunicarte con nosotros.",
    };

    retryMenu.options = [
      { value: "1", label: "Consultar nuevamente", nextStepId: lookup.id },
      { value: "2", label: "Finalizar", nextStepId: exitEnd.id },
    ];

    const example: EditableStep[] = [
      welcome,
      lookup,
      retryMenu,
      exitEnd,
    ];

    this.loadExampleIntoEditor(
      "Consulta de recinto por celular",
      "Consulta una API usando automáticamente el número de WhatsApp del cliente, agrega Google Maps y permite consultar nuevamente sin repetir en bucle.",
      example,
    );

    this.triggerType = "CONTAINS";
    this.triggerValue = "recinto";

    if (!lookupConnector) {
      this.messages.add({
        severity: "warn",
        summary: "Falta configurar el conector GET",
        detail: "Crea un conector GET de tipo Consulta del bot y usa {{celular}} en el parámetro de tu API. Para Bolivia se enviarán los 8 dígitos locales.",
      });
      return;
    }

    this.messages.add({
      severity: "success",
      summary: "Conector asignado",
      detail: `Consulta de recinto: ${lookupConnector.name}. Se enviará automáticamente {{celular}}; en Bolivia se quitará el prefijo 591.`,
    });
  }

  loadPlraConfirmationExample(): void {
    const stepApoya = {
      ...newStep("END"),
      text: "¡Excelente {{nombre}}! Muchísimas gracias por sumarte al equipo del PLRA. Te mantendremos informado de todas las actividades. ¡Juntos lograremos la victoria!",
    };

    const stepNoApoya = {
      ...newStep("END"),
      text: "Entendido {{nombre}}, disculpa la molestia. Hemos actualizado tu registro en el sistema para no enviarte más mensajes. ¡Que tengas un excelente día!",
    };

    const stepMenu = {
      ...newStep("MENU"),
      text: "¡Hola, {{nombre}}! 👋 Te escribimos del equipo del PLRA.\nUno de nuestros coordinadores nos pasó tu contacto porque nos comentó que tienes interés en apoyar nuestro proyecto político.\n🗳️ Queremos confirmar si es así para mantenerte al tanto de las actividades o si hubo algún error en el registro. ¿Nos apoyas?\n\nPor favor, responde seleccionando una opción:\n1️⃣ Sí, quiero apoyar (para registrarte formalmente)\n2️⃣ No me interesa / Fue un error",
      variable: "respuesta_apoyo",
      invalidText: "Opción no válida. Por favor responde con 1 (Sí) o 2 (No).",
      options: [
        { value: "1", label: "1️⃣ Sí, quiero apoyar", nextStepId: stepApoya.id },
        { value: "2", label: "2️⃣ No me interesa / Fue un error", nextStepId: stepNoApoya.id },
      ],
    };

    const example: EditableStep[] = [
      stepMenu,
      stepApoya,
      stepNoApoya,
    ];

    this.loadExampleIntoEditor(
      "Encuesta de Confirmación PLRA",
      "Flujo de confirmación con 2 opciones para registrar votantes comprometidos o desmarcar errores y actualizar automáticamente la base de datos.",
      example,
    );
  }

  private loadExampleIntoEditor(name: string, description: string, example: EditableStep[]): void {
    this.editingFlowId.set(null);
    this.editingFlowVersion.set(null);
    this.name = name;
    this.description = description;
    this.triggerType = "ANY";
    this.triggerValue = "";
    this.steps.set(example);
    this.selectedStepId.set(example[0]?.id ?? "");
    this.viewMode.set("MAP");
    this.collapsedStepIds.set([]);
    this.graphZoom.set(0.82);
    this.messages.add({ severity: "info", summary: "Ejemplo cargado", detail: `${example.length} bloques listos para revisar y guardar.` });
  }

  private buildSteps(): BotFlowStep[] {
    return this.steps().map((step) => {
      if (step.type === "MESSAGE") return { id: step.id, type: "MESSAGE", text: step.text };
      if (step.type === "QUESTION") return { id: step.id, type: "QUESTION", text: step.text, variable: step.variable };
      if (step.type === "MENU") return { id: step.id, type: "MENU", text: step.text, variable: step.variable, invalidText: step.invalidText || undefined, options: step.options.map((option) => ({ ...option })) };
      if (step.type === "CONDITION") return { id: step.id, type: "CONDITION", variable: step.variable, operator: step.operator, value: step.operator === "EXISTS" ? undefined : step.value || undefined, ifTrueText: step.ifTrueText, ifFalseText: step.ifFalseText || undefined };
      if (step.type === "API_REQUEST") return {
        id: step.id,
        type: "API_REQUEST",
        connectorId: step.connectorId,
        statusVariable: step.statusVariable || "api_status",
        mappings: step.apiMappings.map((mapping) => ({
          sourcePath: mapping.sourcePath,
          targetVariable: mapping.targetVariable,
          defaultValue: mapping.defaultValue || undefined,
        })),
        successText: step.successText || undefined,
        notFoundText: step.notFoundText || undefined,
        errorText: step.errorText || undefined,
      };
      return { id: step.id, type: "END", text: step.text || undefined };
    });
  }

  private validationMessage(): string | undefined {
    if (this.name.trim().length < 2) return "Escribe un nombre de al menos 2 caracteres.";
    if (this.triggerType !== "ANY" && !this.triggerValue.trim()) return "Escribe el texto que activará el flujo.";
    if (!this.selectedSessionIds().length) return "Selecciona al menos una sesión.";
    if (!this.steps().length) return "Agrega al menos un paso.";
    if (!this.steps().some((step) => step.type === "END")) return "Agrega al menos un bloque Final para cerrar el recorrido.";
    const ids = new Set(this.steps().map((step) => step.id));

    for (const [index, step] of this.steps().entries()) {
      const prefix = `Paso ${index + 1}`;
      if (["MESSAGE", "QUESTION", "MENU"].includes(step.type) && !step.text.trim()) return `${prefix}: el texto es obligatorio.`;
      if ((step.type === "QUESTION" || step.type === "MENU") && !step.variable.trim()) return `${prefix}: indica dónde guardar la respuesta.`;
      if (step.type === "MENU") {
        if (step.options.length < 2) return `${prefix}: agrega al menos dos opciones.`;
        const values = new Set<string>();
        for (const option of step.options) {
          if (!option.value.trim() || !option.label.trim()) return `${prefix}: completa valor y etiqueta de cada opción.`;
          if (!option.nextStepId || !ids.has(option.nextStepId)) return `${prefix}: selecciona un destino válido para cada opción.`;
          const normalizedValue = option.value.trim().toLocaleLowerCase();
          if (values.has(normalizedValue)) return `${prefix}: los valores de opción no pueden repetirse.`;
          values.add(normalizedValue);
        }
      }
      if (step.type === "CONDITION") {
        if (!step.variable.trim()) return `${prefix}: indica la variable a evaluar.`;
        if (step.operator !== "EXISTS" && !step.value.trim()) return `${prefix}: indica el valor esperado.`;
        if (!step.ifTrueText.trim()) return `${prefix}: escribe la respuesta cuando se cumple.`;
      }
      if (step.type === "API_REQUEST") {
        if (!step.connectorId) return `${prefix}: selecciona un conector externo.`;
        if (!step.statusVariable.trim()) return `${prefix}: indica la variable de estado.`;
        for (const mapping of step.apiMappings) {
          if (!mapping.sourcePath.trim() || !mapping.targetVariable.trim()) return `${prefix}: completa ruta y variable en todos los mapeos.`;
        }
        if (!step.successText.trim() && !step.notFoundText.trim() && !step.errorText.trim()) {
          return `${prefix}: configura al menos un mensaje de resultado.`;
        }
      }
    }
    return undefined;
  }

  create(): void {
    const editingId = this.editingFlowId();
    const editingVersion = this.editingFlowVersion();
    const validation = this.validationMessage();
    if (validation) { this.messages.add({ severity: "warn", summary: "Revisa el flujo", detail: validation }); return; }
    this.saving.set(true);
    this.api.createFlow({ name: this.name, description: this.description || undefined, trigger: { type: this.triggerType, value: this.triggerType === "ANY" ? undefined : this.triggerValue || undefined }, steps: this.buildSteps(), sessionIds: this.selectedSessionIds() }).subscribe({
      next: (created) => {
        this.messages.add({
          severity: "success",
          summary: editingId ? "Nueva versión guardada" : "Flujo guardado",
          detail: editingId
            ? `${created.name}: v${editingVersion} → v${created.version}. La versión anterior quedó en el historial.`
            : `${created.name} · versión ${created.version}`,
        });
        this.resetEditor();
        this.load();
      },
      error: (error: { error?: { message?: string } }) => {
        this.messages.add({
          severity: "error",
          summary: editingId ? "No se pudo guardar la nueva versión" : "No se pudo crear",
          detail: error.error?.message || "Revisa los datos e inténtalo nuevamente.",
        });
        this.saving.set(false);
      },
      complete: () => this.saving.set(false),
    });
  }

  private resetEditor(): void {
    const initial = [newStep("MESSAGE"), newStep("END")];
    this.editingFlowId.set(null);
    this.editingFlowVersion.set(null);
    this.name = ""; this.description = ""; this.triggerType = "ANY"; this.triggerValue = "";
    this.steps.set(initial); this.selectedStepId.set(initial[0].id); this.selectedSessionIds.set([]);
    this.viewMode.set("MAP"); this.collapsedStepIds.set([]); this.graphZoom.set(0.82); this.mapExpanded.set(false);
  }

  toggleActive(flow: BotFlowRecord): void {
    this.api.setFlowActive(flow.id, !flow.isActive).subscribe({ next: () => this.load(), error: (error: { error?: { message?: string } }) => this.messages.add({ severity: "error", summary: "No se pudo cambiar el estado", detail: error.error?.message }) });
  }

  toggleTemplate(flow: BotFlowRecord): void {
    this.api.setFlowTemplate(flow.id, !flow.isTemplate).subscribe({
      next: () => {
        this.messages.add({
          severity: "success",
          summary: flow.isTemplate ? "Ya no es plantilla" : "Guardado como plantilla",
          detail: flow.isTemplate ? undefined : `${flow.name} ahora aparece disponible para clonar.`,
        });
        this.load();
      },
      error: (error: { error?: { message?: string } }) =>
        this.messages.add({ severity: "error", summary: "No se pudo actualizar la plantilla", detail: error.error?.message }),
    });
  }

  startClone(flow: BotFlowRecord): void {
    this.cloningFlow.set(flow);
    this.cloneName = `${flow.name} (copia)`;
    this.cloneSessionIds.set([]);
  }

  cancelClone(): void {
    this.cloningFlow.set(null);
    this.cloneName = "";
    this.cloneSessionIds.set([]);
  }

  toggleCloneSession(id: string): void {
    const current = this.cloneSessionIds();
    this.cloneSessionIds.set(current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  confirmClone(): void {
    const template = this.cloningFlow();
    if (!template) return;
    if (!this.cloneName.trim()) {
      this.messages.add({ severity: "warn", summary: "Ingresa un nombre para el nuevo bot" });
      return;
    }
    if (this.cloneSessionIds().length === 0) {
      this.messages.add({ severity: "warn", summary: "Selecciona al menos una sesión" });
      return;
    }
    this.cloning.set(true);
    this.api.cloneFlow(template.id, { name: this.cloneName.trim(), sessionIds: this.cloneSessionIds() }).subscribe({
      next: (created) => {
        this.cloning.set(false);
        this.messages.add({ severity: "success", summary: "Bot creado desde la plantilla", detail: `${created.name} · v${created.version}` });
        this.cancelClone();
        this.load();
      },
      error: (error: { error?: { message?: string } }) => {
        this.cloning.set(false);
        this.messages.add({ severity: "error", summary: "No se pudo clonar la plantilla", detail: error.error?.message });
      },
    });
  }

  triggerDescription(): string { return this.triggerType === "ANY" ? "Se inicia con cualquier mensaje" : `${this.triggerType === "EXACT" ? "Coincide con" : "Contiene"}: ${this.triggerValue || '...'}`; }
  triggerLabel(flow: BotFlowRecord): string { return flow.definition.trigger.type === "ANY" ? "Cualquier mensaje" : `${flow.definition.trigger.type === "EXACT" ? "Exacto" : "Contiene"}: ${flow.definition.trigger.value || ""}`; }
  stepTypeLabel(type: BotFlowStep["type"]): string { return type === "MESSAGE" ? "Mensaje" : type === "QUESTION" ? "Pregunta" : type === "MENU" ? "Menú" : type === "CONDITION" ? "Condición" : type === "API_REQUEST" ? "Consulta API" : "Final"; }
  stepIcon(type: BotFlowStep["type"]): string { return type === "MESSAGE" ? "pi pi-comment" : type === "QUESTION" ? "pi pi-question-circle" : type === "MENU" ? "pi pi-list" : type === "CONDITION" ? "pi pi-code" : type === "API_REQUEST" ? "pi pi-cloud-download" : "pi pi-flag"; }
  stepPreview(step: EditableStep): string { if (step.type === "CONDITION") { const operator = step.operator === "EQUALS" ? "=" : step.operator === "CONTAINS" ? "contiene" : "tiene valor"; return `${step.variable || 'variable'} ${operator}${step.operator === 'EXISTS' ? '' : ` ${step.value || '...'}`}`; } if (step.type === "API_REQUEST") { return this.botConnectors().find((connector) => connector.id === step.connectorId)?.name || "Conector API sin seleccionar"; } return step.text.trim() || (step.type === "END" ? "Finalizar sin mensaje" : "Sin contenido"); }
  shortPreview(step: EditableStep): string { const value = this.stepPreview(step).replace(/\s+/g, " "); return value.length > 42 ? `${value.slice(0, 42)}…` : value; }
  stepTargetLabel(id: string): string { const index = this.steps().findIndex((step) => step.id === id); return index < 0 ? "Sin destino" : `Paso ${index + 1}: ${this.shortPreview(this.steps()[index])}`; }
}
