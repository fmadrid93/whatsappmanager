import { DatePipe } from "@angular/common";
import { Component, OnDestroy, OnInit, computed, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { ButtonModule } from "primeng/button";
import { TagModule } from "primeng/tag";
import {
  ApiService,
  type ConversationAgentRecord,
  type ConversationMessageRecord,
  type ConversationNoteRecord,
  type ConversationRecord,
  type SessionRecord,
} from "../core/api.service";

@Component({
  standalone: true,
  imports: [DatePipe, FormsModule, ButtonModule, TagModule],
  template: `
    <main class="conversation-page">
      <header class="page-header">
        <div>
          <h1>Conversaciones</h1>
          <p class="muted">Bandeja de atención con historial, intervención humana, flujo y notas internas.</p>
        </div>
        <div class="header-actions">
          <p-button label="Nuevo mensaje" icon="pi pi-send" severity="success" (onClick)="toggleDirectMessage()" />
          <label class="auto-refresh"><input type="checkbox" [(ngModel)]="autoRefresh" /> Actualizar automáticamente</label>
          <p-button label="Actualizar" icon="pi pi-refresh" severity="secondary" [loading]="loading()" (onClick)="refresh()" />
        </div>
      </header>

      @if (directMessageOpen()) {
        <section class="direct-message-card">
          <div class="direct-message-title">
            <div>
              <strong>Nuevo mensaje de WhatsApp</strong>
              <span>Inicia una conversación manual desde una sesión conectada.</span>
            </div>
            <button type="button" class="direct-close" (click)="toggleDirectMessage()" aria-label="Cerrar">×</button>
          </div>

          @if (connectedSessions().length === 0) {
            <div class="composer-warning">
              No hay sesiones CONNECTED disponibles. Una sesión en cuarentena o desconectada no puede enviar.
            </div>
          }

          <div class="direct-message-grid">
            <label>
              <span>Sesión emisora</span>
              <select [(ngModel)]="directSessionId">
                <option value="">Selecciona una sesión</option>
                @for (session of connectedSessions(); track session.id) {
                  <option [value]="session.id">
                    {{ session.name }} · {{ session.phoneE164 || session.expectedPhoneE164 || 'sin número' }}
                  </option>
                }
              </select>
            </label>

            <label>
              <span>Número destino</span>
              <input [(ngModel)]="directPhone" placeholder="+59172620787" inputmode="tel" />
              <small>Incluye código de país.</small>
            </label>

            <label>
              <span>Nombre (opcional)</span>
              <input [(ngModel)]="directName" placeholder="Nombre del contacto" />
            </label>
          </div>

          <label class="direct-text">
            <span>Mensaje</span>
            <textarea
              [(ngModel)]="directText"
              rows="3"
              maxlength="4096"
              placeholder="Escribe el mensaje que quieres enviar..."
              (keydown.control.enter)="sendDirectMessage()"
            ></textarea>
          </label>

          <div class="direct-actions">
            <span>{{ directText.length }}/4096</span>
            <p-button
              label="Enviar mensaje"
              icon="pi pi-send"
              [loading]="directSending()"
              [disabled]="!canSendDirectMessage()"
              (onClick)="sendDirectMessage()"
            />
          </div>

          <section class="batch-test-card">
            <div class="batch-test-title">
              <div>
                <strong>Prueba controlada al mismo número</strong>
                <small>
                  Diagnóstico: máximo 5 mensajes y mínimo 10 segundos entre intentos.
                  Si la sesión deja de estar CONNECTED, el siguiente intento será rechazado por el backend.
                </small>
              </div>
              @if (directBatchProgress()) {
                <span class="batch-progress">{{ directBatchProgress() }}</span>
              }
            </div>

            <div class="batch-test-grid">
              <label>
                <span>Cantidad</span>
                <input
                  type="number"
                  min="2"
                  max="5"
                  step="1"
                  [(ngModel)]="directBatchCount"
                  [disabled]="directBatchSending()"
                />
              </label>

              <label>
                <span>Espera entre mensajes (seg.)</span>
                <input
                  type="number"
                  min="10"
                  max="60"
                  step="1"
                  [(ngModel)]="directBatchDelaySeconds"
                  [disabled]="directBatchSending()"
                />
              </label>

              <div class="batch-test-actions">
                @if (!directBatchSending()) {
                  <p-button
                    [label]="'Enviar prueba x' + directBatchCount"
                    icon="pi pi-forward"
                    severity="warn"
                    [disabled]="!canSendDirectBatch()"
                    (onClick)="sendDirectBatch()"
                  />
                } @else {
                  <p-button
                    label="Detener prueba"
                    icon="pi pi-stop"
                    severity="danger"
                    (onClick)="stopDirectBatch()"
                  />
                }
              </div>
            </div>
          </section>
        </section>
      }

      <section class="filters">
        <input class="search" [(ngModel)]="search" (keyup.enter)="load()" placeholder="Buscar por nombre, teléfono, JID o agente" />
        <select [(ngModel)]="mode" (change)="load()">
          <option value="ALL">Bot y humano</option>
          <option value="BOT">Atendidas por bot</option>
          <option value="HUMAN">Atendidas por humano</option>
        </select>
        <select [(ngModel)]="status" (change)="load()">
          <option value="OPEN">Abiertas</option>
          <option value="CLOSED">Cerradas</option>
          <option value="ALL">Todas</option>
        </select>
        <select [(ngModel)]="sessionId" (change)="load()">
          <option value="">Todas las sesiones</option>
          @for (session of sessions(); track session.id) {
            <option [value]="session.id">{{ session.name }} · {{ session.phoneE164 || session.expectedPhoneE164 || session.status }}</option>
          }
        </select>
        <p-button label="Buscar" icon="pi pi-search" (onClick)="load()" />
      </section>

      <section class="inbox-shell">
        <aside class="conversation-list">
          <div class="pane-title">
            <strong>Conversaciones</strong>
            <span>{{ conversations().length }}</span>
          </div>
          @if (conversations().length === 0) {
            <div class="empty">No hay conversaciones con los filtros seleccionados.</div>
          }
          @for (conversation of conversations(); track conversation.id) {
            <button
              type="button"
              class="conversation-row"
              [class.selected]="selectedId() === conversation.id"
              [class.closed]="conversation.status === 'CLOSED'"
              (click)="select(conversation)"
            >
              <span class="avatar">{{ initials(conversation) }}</span>
              <span class="row-main">
                <span class="row-top">
                  <strong>{{ conversation.displayName || conversation.phoneE164 || cleanJid(conversation.remoteJid) }}</strong>
                  <small>{{ conversation.lastMessageAt ? (conversation.lastMessageAt | date:'shortTime') : '' }}</small>
                </span>
                <span class="preview">
                  @if (conversation.lastMessageDirection === 'OUTBOUND') { <i class="pi pi-reply"></i> }
                  {{ conversation.lastMessagePreview || 'Sin vista previa' }}
                </span>
                <span class="row-meta">
                  <span>{{ conversation.sessionName || 'Sesión' }}</span>
                  <span [class.human]="!conversation.isBotActive">{{ conversation.isBotActive ? 'BOT' : 'HUMANO' }}</span>
                  @if (conversation.tags.length) { <span>{{ conversation.tags.slice(0, 2).join(' · ') }}</span> }
                </span>
              </span>
              @if (conversation.unreadCount > 0) {
                <span class="unread">{{ conversation.unreadCount > 99 ? '99+' : conversation.unreadCount }}</span>
              }
            </button>
          }
        </aside>

        <section class="chat-pane">
          @if (selected(); as conversation) {
            <header class="chat-header">
              <div>
                <h2>{{ conversation.displayName || conversation.phoneE164 || cleanJid(conversation.remoteJid) }}</h2>
                <p>{{ conversation.sessionName }} · {{ conversation.phoneE164 || conversation.remoteJid }}</p>
              </div>
              <div class="chat-actions">
                @if (conversation.isBotActive) {
                  <p-button label="Tomar" icon="pi pi-user" severity="warn" size="small" (onClick)="takeOver(conversation)" />
                } @else {
                  <p-button label="Devolver al bot" icon="pi pi-replay" size="small" (onClick)="release(conversation)" />
                }
                @if (conversation.status === 'OPEN') {
                  <p-button label="Cerrar" icon="pi pi-check" severity="secondary" size="small" (onClick)="close(conversation)" />
                } @else {
                  <p-button label="Reabrir" icon="pi pi-folder-open" severity="secondary" size="small" (onClick)="reopen(conversation)" />
                }
              </div>
            </header>

            <div class="messages" #messageArea>
              @if (messagesLoading()) { <div class="empty">Cargando historial…</div> }
              @if (!messagesLoading() && messages().length === 0) { <div class="empty">Todavía no hay mensajes almacenados.</div> }
              @for (message of messages(); track message.id) {
                <article class="bubble" [class.outbound]="message.direction === 'OUTBOUND'">
                  <div class="bubble-text">{{ message.text || '[' + message.messageType + ']' }}</div>
                  <footer>
                    <span>{{ message.messageTimestamp | date:'short' }}</span>
                    @if (message.direction === 'OUTBOUND') { <span>{{ message.status }}</span> }
                  </footer>
                </article>
              }
            </div>

            <footer class="composer">
              @if (conversation.isBotActive) {
                <div class="composer-warning">Toma la conversación para responder manualmente. Mientras está en BOT, el flujo sigue atendiendo.</div>
              }
              <textarea
                [(ngModel)]="replyText"
                [disabled]="conversation.isBotActive || conversation.status === 'CLOSED' || sending()"
                placeholder="Escribe una respuesta…"
                rows="2"
                (keydown.control.enter)="sendText(conversation)"
              ></textarea>
              <p-button
                label="Enviar"
                icon="pi pi-send"
                [disabled]="conversation.isBotActive || conversation.status === 'CLOSED' || !replyText.trim()"
                [loading]="sending()"
                (onClick)="sendText(conversation)"
              />
            </footer>
          } @else {
            <div class="empty large"><i class="pi pi-comments"></i><strong>Selecciona una conversación</strong><span>Verás aquí el historial y podrás atender al cliente.</span></div>
          }
        </section>

        <aside class="detail-pane">
          @if (selected(); as conversation) {
            <div class="pane-title"><strong>Información</strong></div>
            <div class="detail-scroll">
              <label>Nombre del contacto</label>
              <input [(ngModel)]="profileName" placeholder="Nombre o razón social" />
              <label>Etiquetas</label>
              <input [(ngModel)]="profileTags" placeholder="VENTA, URGENTE, CLIENTE" />
              <p-button label="Guardar información" icon="pi pi-save" size="small" (onClick)="saveProfile(conversation)" />


              <section class="assignment-card">
                <div class="section-title"><strong>Asignación</strong><span>{{ agents().length }} agentes</span></div>
                <div class="assignment-row">
                  <select [(ngModel)]="selectedAgentId" aria-label="Seleccionar agente">
                    <option value="">Selecciona un agente</option>
                    @for (agent of agents(); track agent.id) {
                      <option [value]="agent.id">{{ agent.displayName || agent.email }}</option>
                    }
                  </select>
                  <p-button
                    label="Asignar"
                    icon="pi pi-user-edit"
                    size="small"
                    [disabled]="!selectedAgentId"
                    (onClick)="assignAgent(conversation)"
                  />
                </div>
              </section>

              <div class="info-card">
                <div><span>Estado</span><strong>{{ conversation.status }}</strong></div>
                <div><span>Atención</span><strong>{{ conversation.isBotActive ? 'BOT' : 'HUMANO' }}</strong></div>
                <div><span>Agente</span><strong>{{ conversation.assignedAgentName || conversation.assignedAgentEmail || 'Sin asignar' }}</strong></div>
                <div><span>Sesión</span><strong>{{ conversation.sessionName }}</strong></div>
              </div>

              <section class="flow-card">
                <div class="section-title"><strong>Flujo actual</strong><p-button icon="pi pi-refresh" [text]="true" size="small" title="Reiniciar flujo" (onClick)="resetFlow(conversation)" /></div>
                <p><b>{{ conversation.flowName || 'Sin flujo en curso' }}</b></p>
                @if (conversation.flowNodeId) { <p>Paso: {{ conversation.flowNodeId }}</p> }
                @if (conversation.flowAwaitingVariable) { <p>Esperando: <code>{{ conversation.flowAwaitingVariable }}</code></p> }
                @if (conversation.flowVariables && variableEntries().length) {
                  <div class="variables">
                    @for (entry of variableEntries(); track entry[0]) {
                      <div><span>{{ entry[0] }}</span><strong>{{ entry[1] }}</strong></div>
                    }
                  </div>
                }
              </section>

              <section class="notes-card">
                <div class="section-title"><strong>Notas internas</strong><span>{{ notes().length }}</span></div>
                <textarea [(ngModel)]="noteText" rows="2" placeholder="Nota visible solo para el equipo"></textarea>
                <p-button label="Agregar nota" icon="pi pi-plus" size="small" [disabled]="!noteText.trim()" (onClick)="addNote(conversation)" />
                <div class="notes-list">
                  @for (note of notes(); track note.id) {
                    <article>
                      <p>{{ note.text }}</p>
                      <small>{{ note.authorName }} · {{ note.createdAt | date:'short' }}</small>
                    </article>
                  }
                </div>
              </section>
            </div>
          } @else {
            <div class="empty">Sin conversación seleccionada.</div>
          }
        </aside>
      </section>

      @if (error()) { <div class="error-toast">{{ error() }}</div> }
      @if (success()) { <div class="success-toast">{{ success() }}</div> }
    </main>
  `,
  styles: [`
    :host{display:block}.conversation-page{padding:1.25rem;max-width:1800px;margin:0 auto}.page-header{display:flex;justify-content:space-between;gap:1rem;align-items:center;margin-bottom:1rem}.page-header h1{margin:0}.page-header p{margin:.3rem 0 0}.header-actions,.chat-actions{display:flex;align-items:center;gap:.55rem;flex-wrap:wrap}.auto-refresh{font-size:.85rem;color:#64748b;display:flex;gap:.4rem;align-items:center}.filters{display:grid;grid-template-columns:minmax(240px,1.5fr) repeat(3,minmax(150px,.7fr)) auto;gap:.65rem;margin-bottom:1rem}.filters input,.filters select,.detail-pane input,.detail-pane textarea,.composer textarea{width:100%;border:1px solid #dbe3ea;border-radius:.65rem;padding:.72rem;background:#fff;color:#17212b}.inbox-shell{display:grid;grid-template-columns:330px minmax(420px,1fr) 320px;min-height:680px;height:calc(100vh - 195px);background:#fff;border:1px solid #dfe5eb;border-radius:1rem;overflow:hidden;box-shadow:0 8px 30px rgba(15,23,42,.06)}.conversation-list,.detail-pane{min-width:0;background:#fbfcfd}.conversation-list{border-right:1px solid #e5eaf0;overflow:auto}.detail-pane{border-left:1px solid #e5eaf0;overflow:hidden}.pane-title{height:52px;display:flex;align-items:center;justify-content:space-between;padding:0 1rem;border-bottom:1px solid #e5eaf0}.pane-title span{background:#e8edf2;border-radius:99px;padding:.15rem .5rem;font-size:.75rem}.conversation-row{width:100%;border:0;border-bottom:1px solid #edf1f4;background:transparent;padding:.8rem;display:grid;grid-template-columns:42px 1fr auto;gap:.7rem;text-align:left;cursor:pointer;color:inherit}.conversation-row:hover{background:#f2f7fb}.conversation-row.selected{background:#eaf5ff;border-left:4px solid #2196f3;padding-left:calc(.8rem - 4px)}.conversation-row.closed{opacity:.68}.avatar{width:42px;height:42px;border-radius:50%;display:grid;place-items:center;background:#dcecff;color:#125f9b;font-weight:700}.row-main{min-width:0}.row-top{display:flex;justify-content:space-between;gap:.5rem}.row-top strong,.preview{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.row-top small{color:#7b8794;font-size:.72rem}.preview{display:block;color:#64748b;font-size:.84rem;margin:.25rem 0}.preview i{font-size:.7rem}.row-meta{display:flex;gap:.35rem;flex-wrap:wrap}.row-meta span{font-size:.68rem;padding:.12rem .35rem;border-radius:99px;background:#edf1f5;color:#5d6875}.row-meta .human{background:#fff0d8;color:#8a5300}.unread{align-self:center;background:#18a957;color:white;border-radius:99px;min-width:22px;padding:.2rem .4rem;text-align:center;font-size:.72rem}.chat-pane{display:grid;grid-template-rows:auto 1fr auto;min-width:0;background:#f1eee8}.chat-header{background:#fff;min-height:64px;padding:.7rem 1rem;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #e5eaf0}.chat-header h2{font-size:1rem;margin:0}.chat-header p{margin:.2rem 0 0;color:#64748b;font-size:.78rem}.messages{padding:1rem;overflow:auto;display:flex;flex-direction:column;gap:.6rem}.bubble{align-self:flex-start;max-width:min(75%,620px);background:#fff;border-radius:.8rem .8rem .8rem .2rem;padding:.65rem .75rem;box-shadow:0 1px 2px rgba(0,0,0,.1)}.bubble.outbound{align-self:flex-end;background:#d9fdd3;border-radius:.8rem .8rem .2rem .8rem}.bubble-text{white-space:pre-wrap;overflow-wrap:anywhere}.bubble footer{display:flex;justify-content:flex-end;gap:.4rem;margin-top:.35rem;color:#74808c;font-size:.65rem}.composer{background:#fff;padding:.75rem;display:grid;grid-template-columns:1fr auto;gap:.6rem;border-top:1px solid #e5eaf0}.composer-warning{grid-column:1/-1;background:#fff7e6;color:#7a4b00;border-radius:.5rem;padding:.5rem;font-size:.78rem}.detail-scroll{height:calc(100% - 52px);overflow:auto;padding:1rem;display:flex;flex-direction:column;gap:.55rem}.detail-scroll label{font-size:.77rem;font-weight:700;color:#52606d}.assignment-card,.info-card,.flow-card,.notes-card{border-top:1px solid #e5eaf0;margin-top:.5rem;padding-top:1rem}.assignment-row{display:grid;grid-template-columns:1fr auto;gap:.45rem}.assignment-row select{border:1px solid #d7e0e8;border-radius:.5rem;padding:.55rem;min-width:0}.info-card{display:grid;gap:.5rem}.info-card div,.variables div{display:flex;justify-content:space-between;gap:.7rem;font-size:.8rem}.info-card span,.variables span{color:#697684}.flow-card p{font-size:.82rem;margin:.35rem 0}.section-title{display:flex;justify-content:space-between;align-items:center}.variables{background:#f2f5f8;border-radius:.6rem;padding:.6rem;display:grid;gap:.35rem}.notes-list{display:grid;gap:.5rem;margin-top:.5rem}.notes-list article{background:#fff;border:1px solid #e1e7ed;border-radius:.55rem;padding:.55rem}.notes-list p{margin:0 0 .3rem;font-size:.8rem;white-space:pre-wrap}.notes-list small{color:#74808c}.empty{padding:2rem;text-align:center;color:#778491}.empty.large{height:100%;display:grid;place-items:center;align-content:center;gap:.7rem}.empty.large i{font-size:3rem}.error-toast,.success-toast{position:fixed;right:1.2rem;bottom:1.2rem;max-width:420px;padding:.85rem 1rem;border-radius:.7rem;box-shadow:0 8px 30px rgba(0,0,0,.18);z-index:10}.error-toast{background:#fee2e2;color:#991b1b}.success-toast{background:#dcfce7;color:#166534}.direct-message-card{margin-bottom:1rem;background:#fff;border:1px solid #dbe3ea;border-radius:1rem;padding:1rem;box-shadow:0 8px 24px rgba(15,23,42,.06)}.direct-message-title{display:flex;justify-content:space-between;gap:1rem;align-items:flex-start;margin-bottom:.85rem}.direct-message-title div{display:grid;gap:.2rem}.direct-message-title span{font-size:.8rem;color:#64748b}.direct-close{border:0;background:transparent;font-size:1.5rem;line-height:1;color:#64748b;cursor:pointer}.direct-message-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:.7rem}.direct-message-grid label,.direct-text{display:grid;gap:.3rem;font-size:.78rem;font-weight:700;color:#52606d}.direct-message-grid input,.direct-message-grid select,.direct-text textarea{width:100%;border:1px solid #dbe3ea;border-radius:.65rem;padding:.72rem;background:#fff;color:#17212b}.direct-message-grid small{font-size:.7rem;font-weight:400;color:#74808c}.direct-text{margin-top:.7rem}.direct-actions{display:flex;justify-content:flex-end;align-items:center;gap:.7rem;margin-top:.7rem}.direct-actions span{font-size:.72rem;color:#74808c}.batch-test-card{margin-top:1rem;border-top:1px solid #e2e8f0;padding-top:1rem;display:grid;gap:.75rem}.batch-test-title{display:flex;justify-content:space-between;gap:1rem;align-items:flex-start}.batch-test-title>div{display:grid;gap:.2rem}.batch-test-title small{color:#64748b;font-weight:400;max-width:780px}.batch-progress{background:#eff6ff;color:#1d4ed8;border-radius:999px;padding:.25rem .55rem;font-size:.75rem;white-space:nowrap}.batch-test-grid{display:grid;grid-template-columns:150px 230px 1fr;gap:.7rem;align-items:end}.batch-test-grid label{display:grid;gap:.3rem;font-size:.78rem;font-weight:700;color:#52606d}.batch-test-grid input{width:100%;border:1px solid #dbe3ea;border-radius:.65rem;padding:.72rem;background:#fff;color:#17212b}.batch-test-actions{display:flex;justify-content:flex-end;align-items:end}@media(max-width:1200px){.inbox-shell{grid-template-columns:300px 1fr}.detail-pane{display:none}}@media(max-width:760px){.conversation-page{padding:.7rem}.direct-message-grid{grid-template-columns:1fr}.batch-test-grid{grid-template-columns:1fr}.batch-test-actions{justify-content:stretch}.filters{grid-template-columns:1fr 1fr}.filters .search{grid-column:1/-1}.inbox-shell{grid-template-columns:1fr;height:auto;min-height:650px}.conversation-list{max-height:280px}.chat-pane{min-height:600px}.page-header{align-items:flex-start;flex-direction:column}}
  `],
})
export class ConversationsComponent implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private timer?: ReturnType<typeof setInterval>;
  private directBatchTimer?: ReturnType<typeof setTimeout>;
  private messageRequestId = 0;
  private noteRequestId = 0;

  readonly conversations = signal<ConversationRecord[]>([]);
  readonly agents = signal<ConversationAgentRecord[]>([]);
  readonly sessions = signal<SessionRecord[]>([]);
  readonly selectedId = signal<string | null>(null);
  readonly messages = signal<ConversationMessageRecord[]>([]);
  readonly notes = signal<ConversationNoteRecord[]>([]);
  readonly loading = signal(false);
  readonly messagesLoading = signal(false);
  readonly sending = signal(false);
  readonly directSending = signal(false);
  readonly directBatchSending = signal(false);
  readonly directBatchProgress = signal("");
  readonly directMessageOpen = signal(false);
  readonly error = signal("");
  readonly success = signal("");
  readonly selected = computed(() => this.conversations().find((item) => item.id === this.selectedId()) ?? null);
  readonly connectedSessions = computed(() => this.sessions().filter((item) => item.status === "CONNECTED"));
  readonly variableEntries = computed(() => Object.entries(this.selected()?.flowVariables ?? {}));

  search = "";
  mode: "ALL" | "BOT" | "HUMAN" = "ALL";
  status: "ALL" | "OPEN" | "CLOSED" = "OPEN";
  sessionId = "";
  autoRefresh = true;
  replyText = "";
  directSessionId = "";
  directPhone = "";
  directName = "";
  directText = "";
  directBatchCount = 3;
  directBatchDelaySeconds = 10;
  profileName = "";
  profileTags = "";
  noteText = "";
  selectedAgentId = "";

  ngOnInit(): void {
    this.api.sessions().subscribe((items) => {
      this.sessions.set(items);
      if (!this.directSessionId) {
        this.directSessionId = items.find((item) => item.status === "CONNECTED")?.id ?? "";
      }
    });
    this.api.conversationAgents().subscribe((items) => this.agents.set(items));
    this.refresh();
    this.timer = setInterval(() => {
      if (!this.autoRefresh) return;
      this.refresh(false);
    }, 5000);
  }

  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.directBatchTimer) clearTimeout(this.directBatchTimer);
  }

  refresh(showLoading = true): void {
    this.load(showLoading);
    const selectedId = this.selectedId();
    if (selectedId) {
      this.loadConversation(selectedId, showLoading);
      this.refreshSelected(selectedId);
    }
  }

  load(showLoading = true): void {
    if (showLoading) this.loading.set(true);
    this.api.conversations({
      search: this.search || undefined,
      mode: this.mode,
      status: this.status,
      sessionId: this.sessionId || undefined,
      take: 500,
    }).subscribe({
      next: (items) => {
        this.conversations.set(items);
        const current = this.selectedId();
        if (current && !items.some((item) => item.id === current)) this.selectedId.set(null);
      },
      error: (error) => this.setError(error, "No se pudieron cargar las conversaciones."),
      complete: () => this.loading.set(false),
    });
  }

  select(item: ConversationRecord): void {
    this.selectedId.set(item.id);
    this.profileName = item.displayName ?? "";
    this.profileTags = item.tags.join(", ");
    this.selectedAgentId = item.assignedAgentId ?? "";
    this.loadConversation(item.id);
    if (item.unreadCount > 0) {
      this.api.markConversationRead(item.id).subscribe(() => this.refresh(false));
    }
  }

  loadConversation(id: string, showLoading = true): void {
    const messageRequestId = ++this.messageRequestId;
    const noteRequestId = ++this.noteRequestId;
    if (showLoading) this.messagesLoading.set(true);

    this.api.conversationMessages(id).subscribe({
      next: (items) => {
        if (this.selectedId() !== id || messageRequestId !== this.messageRequestId) return;
        this.messages.set(items);
      },
      error: (error) => {
        if (this.selectedId() !== id || messageRequestId !== this.messageRequestId) return;
        this.setError(error, "No se pudo cargar el historial.");
      },
      complete: () => {
        if (this.selectedId() === id && messageRequestId === this.messageRequestId) {
          this.messagesLoading.set(false);
        }
      },
    });

    this.api.conversationNotes(id).subscribe({
      next: (items) => {
        if (this.selectedId() !== id || noteRequestId !== this.noteRequestId) return;
        this.notes.set(items);
      },
    });
  }

  toggleDirectMessage(): void {
    const next = !this.directMessageOpen();
    this.directMessageOpen.set(next);
    if (next && !this.directSessionId) {
      this.directSessionId = this.connectedSessions()[0]?.id ?? "";
    }
  }

  canSendDirectMessage(): boolean {
    const digits = this.directPhone.replace(/\D/g, "");
    return Boolean(
      this.directSessionId
      && digits.length >= 8
      && digits.length <= 15
      && this.directText.trim()
      && !this.directSending()
      && !this.directBatchSending()
    );
  }

  canSendDirectBatch(): boolean {
    const digits = this.directPhone.replace(/\D/g, "");
    const count = Number(this.directBatchCount);
    const delay = Number(this.directBatchDelaySeconds);

    return Boolean(
      this.directSessionId
      && digits.length >= 8
      && digits.length <= 15
      && this.directText.trim()
      && Number.isInteger(count)
      && count >= 2
      && count <= 5
      && Number.isInteger(delay)
      && delay >= 10
      && delay <= 60
      && !this.directSending()
      && !this.directBatchSending()
    );
  }

  sendDirectMessage(): void {
    if (!this.canSendDirectMessage()) return;

    this.directSending.set(true);
    this.api.sendDirectConversationText({
      sessionId: this.directSessionId,
      phone: this.directPhone,
      displayName: this.directName.trim() || undefined,
      text: this.directText.trim(),
    }).subscribe({
      next: (result) => {
        this.directText = "";
        this.directPhone = "";
        this.directName = "";
        this.directMessageOpen.set(false);
        this.flashSuccess("Mensaje puesto en cola.");

        this.status = "OPEN";
        this.mode = "ALL";
        this.load(false);

        setTimeout(() => {
          this.api.conversation(result.conversationId).subscribe({
            next: (conversation) => {
              this.conversations.update((items) => {
                const exists = items.some((item) => item.id === conversation.id);
                return exists
                  ? items.map((item) => item.id === conversation.id ? conversation : item)
                  : [conversation, ...items];
              });
              this.select(conversation);
              this.loadConversation(conversation.id, false);
            },
          });
        }, 400);
      },
      error: (error) => this.setError(error, "No se pudo iniciar el mensaje."),
      complete: () => this.directSending.set(false),
    });
  }

  sendDirectBatch(): void {
    if (!this.canSendDirectBatch()) return;

    const count = Math.max(2, Math.min(5, Math.trunc(Number(this.directBatchCount))));
    const delaySeconds = Math.max(10, Math.min(60, Math.trunc(Number(this.directBatchDelaySeconds))));
    const sessionId = this.directSessionId;
    const phone = this.directPhone;
    const displayName = this.directName.trim() || undefined;
    const text = this.directText.trim();

    const confirmed = window.confirm(
      `Se enviarán ${count} mensajes al mismo número, con ${delaySeconds} segundos entre intentos. `
      + "Usa esta función únicamente para una prueba autorizada. ¿Continuar?",
    );
    if (!confirmed) return;

    this.directBatchSending.set(true);
    this.directBatchProgress.set(`Preparando 1/${count}`);

    const queueOne = (index: number): void => {
      if (!this.directBatchSending()) return;

      if (index >= count) {
        this.directBatchSending.set(false);
        this.directBatchProgress.set(`${count}/${count} mensajes puestos en cola`);
        this.flashSuccess(`Prueba controlada completada: ${count} mensajes puestos en cola.`);
        this.status = "OPEN";
        this.mode = "ALL";
        this.load(false);
        return;
      }

      this.directBatchProgress.set(`Enviando ${index + 1}/${count}`);

      this.api.sendDirectConversationText({
        sessionId,
        phone,
        displayName,
        text,
      }).subscribe({
        next: () => {
          this.directBatchProgress.set(`${index + 1}/${count} puesto en cola`);
        },
        error: (error) => {
          this.directBatchSending.set(false);
          this.directBatchProgress.set(`Detenida en ${index + 1}/${count}`);
          this.setError(
            error,
            `La prueba se detuvo en el mensaje ${index + 1} de ${count}. Revisa si la sesión quedó limitada o en cuarentena.`,
          );
        },
        complete: () => {
          if (!this.directBatchSending()) return;

          if (index + 1 >= count) {
            queueOne(index + 1);
            return;
          }

          this.directBatchProgress.set(
            `${index + 1}/${count} listo · esperando ${delaySeconds}s`,
          );
          this.directBatchTimer = setTimeout(
            () => queueOne(index + 1),
            delaySeconds * 1000,
          );
        },
      });
    };

    queueOne(0);
  }

  stopDirectBatch(): void {
    if (this.directBatchTimer) {
      clearTimeout(this.directBatchTimer);
      this.directBatchTimer = undefined;
    }

    this.directBatchSending.set(false);
    this.directBatchProgress.set("Prueba detenida manualmente");
  }

  takeOver(item: ConversationRecord): void {
    this.api.takeOver(item.id).subscribe({
      next: () => { this.flashSuccess("Conversación asignada a atención humana."); this.refreshSelected(item.id); },
      error: (error) => this.setError(error, "No se pudo tomar la conversación."),
    });
  }

  assignAgent(item: ConversationRecord): void {
    if (!this.selectedAgentId) return;
    this.api.assignConversation(item.id, this.selectedAgentId).subscribe({
      next: () => { this.flashSuccess("Conversación transferida al agente seleccionado."); this.refreshSelected(item.id); },
      error: (error) => this.setError(error, "No se pudo transferir la conversación."),
    });
  }

  release(item: ConversationRecord): void {
    this.api.release(item.id).subscribe({
      next: () => { this.flashSuccess("La conversación volvió al bot."); this.refreshSelected(item.id); },
      error: (error) => this.setError(error, "No se pudo devolver la conversación al bot."),
    });
  }

  sendText(item: ConversationRecord): void {
    const text = this.replyText.trim();
    if (!text || item.isBotActive || item.status === "CLOSED") return;
    this.sending.set(true);
    this.api.sendConversationText(item.id, text).subscribe({
      next: () => {
        this.replyText = "";
        this.flashSuccess("Respuesta puesta en cola.");
        setTimeout(() => this.loadConversation(item.id, false), 1200);
      },
      error: (error) => this.setError(error, "No se pudo poner la respuesta en cola."),
      complete: () => this.sending.set(false),
    });
  }

  saveProfile(item: ConversationRecord): void {
    const tags = this.profileTags.split(",").map((value) => value.trim()).filter(Boolean);
    this.api.updateConversationProfile(item.id, { displayName: this.profileName.trim(), tags }).subscribe({
      next: () => { this.flashSuccess("Información actualizada."); this.refreshSelected(item.id); },
      error: (error) => this.setError(error, "No se pudo actualizar la información."),
    });
  }

  addNote(item: ConversationRecord): void {
    const text = this.noteText.trim();
    if (!text) return;
    this.api.addConversationNote(item.id, text).subscribe({
      next: (note) => { this.notes.update((items) => [note, ...items]); this.noteText = ""; },
      error: (error) => this.setError(error, "No se pudo guardar la nota."),
    });
  }

  resetFlow(item: ConversationRecord): void {
    this.api.resetConversationFlow(item.id).subscribe({
      next: () => { this.flashSuccess("Estado del flujo reiniciado."); this.refreshSelected(item.id); },
      error: (error) => this.setError(error, "No se pudo reiniciar el flujo."),
    });
  }

  close(item: ConversationRecord): void {
    this.api.closeConversation(item.id).subscribe({
      next: () => { this.flashSuccess("Conversación cerrada."); this.refreshSelected(item.id); },
      error: (error) => this.setError(error, "No se pudo cerrar la conversación."),
    });
  }

  reopen(item: ConversationRecord): void {
    this.api.reopenConversation(item.id).subscribe({
      next: () => { this.flashSuccess("Conversación reabierta."); this.refreshSelected(item.id); },
      error: (error) => this.setError(error, "No se pudo reabrir la conversación."),
    });
  }

  refreshSelected(id: string): void {
    this.api.conversation(id).subscribe({
      next: (updated) => {
        this.conversations.update((items) => items.map((item) => item.id === id ? updated : item));
        this.profileName = updated.displayName ?? "";
        this.profileTags = updated.tags.join(", ");
        this.selectedAgentId = updated.assignedAgentId ?? "";
      },
    });
  }

  cleanJid(jid: string): string {
    return jid.split("@")[0] ?? jid;
  }

  initials(item: ConversationRecord): string {
    const value = item.displayName || item.phoneE164 || this.cleanJid(item.remoteJid);
    return value.replace("+", "").slice(0, 2).toUpperCase();
  }

  private setError(error: unknown, fallback: string): void {
    const candidate = error as { error?: { message?: string }; message?: string };
    this.error.set(candidate?.error?.message || candidate?.message || fallback);
    setTimeout(() => this.error.set(""), 5000);
    this.loading.set(false);
    this.messagesLoading.set(false);
    this.sending.set(false);
    this.directSending.set(false);
    this.directBatchSending.set(false);
  }

  private flashSuccess(message: string): void {
    this.success.set(message);
    setTimeout(() => this.success.set(""), 3000);
  }
}
