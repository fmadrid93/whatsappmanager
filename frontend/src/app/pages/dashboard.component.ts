import { Component, OnInit, inject, signal } from "@angular/core";
import { RouterLink } from "@angular/router";
import { forkJoin } from "rxjs";
import { CardModule } from "primeng/card";
import { ButtonModule } from "primeng/button";
import { ApiService, type CampaignRecord, type CapacitySnapshot, type ConversationRecord, type SessionRecord } from "../core/api.service";

@Component({
  standalone: true,
  imports: [CardModule, ButtonModule, RouterLink],
  template: `
    <main class="page">
      <div class="page-header">
        <div><h1>Resumen operativo</h1><div class="muted">Estado actual de la plataforma</div></div>
        <a routerLink="/sesiones"><p-button label="Nueva sesión" icon="pi pi-plus" /></a>
      </div>
      <div class="stats">
        <p-card><div class="value">{{ sessions() }}</div><div class="muted">Sesiones</div></p-card>
        <p-card><div class="value">{{ connected() }}</div><div class="muted">Conectadas</div></p-card>
        <p-card><div class="value">{{ campaigns() }}</div><div class="muted">Campañas</div></p-card>
        <p-card><div class="value">{{ conversations() }}</div><div class="muted">Conversaciones</div></p-card>
        <p-card><div class="value">{{ pendingMessages() }}</div><div class="muted">Mensajes pendientes</div></p-card>
        <p-card><div class="value">{{ messagesSent() }}</div><div class="muted">Enviados en {{ period() }}</div></p-card>
      </div>
      <div class="grid two" style="margin-top:1rem">
        <p-card header="Flujo recomendado">
          <ol>
            <li>Crea una sesión y escanea el QR.</li>
            <li>Sube multimedia temporal, cuando corresponda.</li>
            <li>Crea la campaña y asigna sesiones de relevo.</li>
            <li>Inicia la campaña y observa los contadores.</li>
          </ol>
        </p-card>
        <p-card header="Capacidad y escalado">
          <p>Sesiones: {{ sessions() }} / {{ maxSessions() }}</p>
          <p>Backlog tenant: {{ pendingMessages() }} / {{ maxPendingMessages() }}</p>
          <p>Cuota mensual reservada: {{ messagesReserved() }} / {{ monthlyLimit() }}</p>
          <p>Outbox, cuotas y sharding protegen la plataforma ante crecimiento.</p>
        </p-card>
      </div>
    </main>
  `,
  styles: [`
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 1rem; }
    .value { font-size: 2rem; font-weight: 800; margin-bottom: .25rem; }
    li { margin-bottom: .5rem; }
  `],
})
export class DashboardComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly sessions = signal(0);
  readonly connected = signal(0);
  readonly campaigns = signal(0);
  readonly conversations = signal(0);
  readonly pendingMessages = signal(0);
  readonly messagesReserved = signal(0);
  readonly messagesSent = signal(0);
  readonly period = signal("-");
  readonly maxSessions = signal(0);
  readonly maxPendingMessages = signal(0);
  readonly monthlyLimit = signal(0);

  ngOnInit(): void {
    forkJoin({
      sessions: this.api.sessions(),
      campaigns: this.api.campaigns(),
      conversations: this.api.conversations(),
      capacity: this.api.capacity(),
    }).subscribe(({
      sessions,
      campaigns,
      conversations,
      capacity,
    }: {
      sessions: SessionRecord[];
      campaigns: CampaignRecord[];
      conversations: ConversationRecord[];
      capacity: CapacitySnapshot;
    }) => {
      this.sessions.set(sessions.length);
      this.connected.set(sessions.filter((item) => item.status === "CONNECTED").length);
      this.campaigns.set(campaigns.length);
      this.conversations.set(conversations.length);
      this.pendingMessages.set(capacity.pendingMessages);
      this.messagesReserved.set(capacity.messagesReserved);
      this.messagesSent.set(capacity.messagesSent);
      this.period.set(capacity.period);
      this.maxSessions.set(capacity.limits.maxSessions);
      this.maxPendingMessages.set(capacity.limits.maxPendingMessages);
      this.monthlyLimit.set(capacity.limits.monthlyMessageLimit);
    });
  }
}
