import type { IOutboxRepository } from "../application/ports/repositories/outbox.repository.js";
import type { IEventTransport } from "../application/ports/events/event-transport.js";
import { logger } from "../shared/logger/logger.js";
import { metrics } from "../shared/observability/metrics.js";

export class OutboxPublisherWorker {
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly outbox: IOutboxRepository,
    private readonly transport: IEventTransport,
    private readonly workerId: string,
    private readonly batchSize: number,
    private readonly lockSeconds: number,
    private readonly intervalMs: number,
  ) {}

  start(): void {
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  async stopAndWait(timeoutMs: number): Promise<void> {
    this.stop();
    const deadline = Date.now() + timeoutMs;
    while (this.running && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (this.running) throw new Error("El publicador Outbox no terminó a tiempo.");
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const events = await this.outbox.claimBatch({
        workerId: `${this.workerId}:outbox`,
        limit: this.batchSize,
        lockExpiresAt: new Date(Date.now() + this.lockSeconds * 1000),
      });
      metrics.gauge("wa_outbox_claimed", "Outbox events claimed in the last cycle.", { worker: this.workerId }, events.length);
      if (!events.length) {
        metrics.gauge("wa_outbox_pending", "Pending transactional outbox events.", {}, await this.outbox.countPending());
        return;
      }
      try {
        await this.transport.publish(events);
        await this.outbox.markPublished(events.map((event) => event.id));
        metrics.increment("wa_outbox_published_total", "Transactional outbox events published.", { transport: this.transport.constructor.name }, events.length);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Error publicando Outbox";
        const maxAttempt = Math.max(...events.map((event) => event.attemptCount));
        const delaySeconds = Math.min(300, 2 ** Math.min(maxAttempt, 8));
        await this.outbox.markFailed({
          ids: events.map((event) => event.id),
          errorMessage: message,
          retryAt: new Date(Date.now() + delaySeconds * 1000),
        });
        metrics.increment("wa_outbox_publish_failed_total", "Transactional outbox publish failures.", { transport: this.transport.constructor.name });
        logger.error({ error, eventIds: events.map((event) => event.id) }, "Error publicando eventos Outbox.");
      }
    } catch (error) {
      metrics.increment("wa_outbox_cycle_failed_total", "Transactional outbox worker cycle failures.", { worker: this.workerId });
      logger.error({ error, workerId: this.workerId }, "Falló un ciclo del publicador Outbox.");
    } finally {
      this.running = false;
    }
  }
}
