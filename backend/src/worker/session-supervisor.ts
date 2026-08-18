import type { ISessionRepository } from "../application/ports/repositories/session.repository.js";
import type { IWhatsAppSocketRegistry } from "../application/ports/whatsapp/socket-registry.js";
import type { ISessionGateway } from "../application/ports/whatsapp/session-gateway.js";
import { logger } from "../shared/logger/logger.js";
import { metrics } from "../shared/observability/metrics.js";
import { belongsToShard, rendezvousOwner } from "../domain/scaling/shard.js";
import type { IWorkerNodeRepository } from "../application/ports/repositories/worker-node.repository.js";

export class SessionSupervisor {
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly sessions: ISessionRepository,
    private readonly registry: IWhatsAppSocketRegistry,
    private readonly gateway: ISessionGateway,
    private readonly workerId: string,
    private readonly leaseSeconds: number,
    private readonly intervalMs: number,
    private readonly workerNodes: IWorkerNodeRepository,
    private readonly shardMode: "AUTO" | "STATIC",
    private readonly shardId: number,
    private readonly shardCount: number,
  ) {}

  start(): void {
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await Promise.all(this.registry.ids().map((id) => this.gateway.stop(id)));
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const expiresAt = () => new Date(Date.now() + this.leaseSeconds * 1000);
      const activeWorkerIds = this.shardMode === "AUTO"
        ? (await this.workerNodes.listActive(new Date())).map((node) => node.id)
        : [];
      if (!activeWorkerIds.includes(this.workerId)) activeWorkerIds.push(this.workerId);
      const owns = (sessionId: string, shardKey: number) => this.shardMode === "STATIC"
        ? belongsToShard(shardKey, this.shardId, this.shardCount)
        : rendezvousOwner(sessionId, activeWorkerIds) === this.workerId;
      metrics.gauge("wa_sessions_local", "WhatsApp sockets owned by this worker.", { worker: this.workerId }, this.registry.ids().length);

      for (const sessionId of this.registry.ids()) {
        const owned = await this.sessions.findById(sessionId);
        if (!owned || !owns(owned.id, owned.shardKey)) {
          logger.info({ sessionId, shardId: this.shardId }, "La sesión será drenada hacia otro shard.");
          await this.gateway.stop(sessionId);
          await this.sessions.releaseLease(sessionId, this.workerId);
          continue;
        }
        const renewed = await this.sessions.renewLease(sessionId, this.workerId, expiresAt());
        if (!renewed) {
          logger.warn({ sessionId }, "Lease perdido; se cerrará el socket local.");
          metrics.increment("wa_session_lease_lost_total", "Session leases lost by workers.", { worker: this.workerId });
          await this.gateway.stop(sessionId);
        }
      }

      const candidates = await this.sessions.listStartCandidates(200);
      for (const session of candidates) {
        if (!owns(session.id, session.shardKey)) continue;
        if (this.registry.has(session.id)) continue;
        const acquired = await this.sessions.acquireLease(session.id, this.workerId, expiresAt());
        if (!acquired) continue;
        try {
          await this.gateway.start(session.id);
          metrics.increment("wa_session_start_total", "Session socket starts.", { worker: this.workerId });
        } catch (error) {
          metrics.increment("wa_session_start_failed_total", "Failed session socket starts.", { worker: this.workerId });
          logger.error({ error, sessionId: session.id }, "No se pudo iniciar la sesión.");
          await this.sessions.updateStatus(session.id, "DISCONNECTED", {
            disconnectReason: error instanceof Error ? error.message : "startError",
          });
          await this.sessions.releaseLease(session.id, this.workerId);
        }
      }
    } catch (error) {
      metrics.increment("wa_session_supervisor_failed_total", "Session supervisor cycle failures.", { worker: this.workerId });
      logger.error({ error, workerId: this.workerId }, "Falló un ciclo del supervisor de sesiones.");
    } finally {
      this.running = false;
    }
  }
}
