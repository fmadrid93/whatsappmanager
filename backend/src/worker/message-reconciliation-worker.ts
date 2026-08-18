import type { IMessageAttemptRepository } from "../application/ports/repositories/message-attempt.repository.js";
import type { IWhatsAppMessageRepository } from "../application/ports/repositories/whatsapp-message.repository.js";
import type { ICampaignRepository } from "../application/ports/repositories/campaign.repository.js";
import { logger } from "../shared/logger/logger.js";
import { metrics } from "../shared/observability/metrics.js";

export class MessageReconciliationWorker {
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly attempts: IMessageAttemptRepository,
    private readonly messages: IWhatsAppMessageRepository,
    private readonly campaigns: ICampaignRepository,
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
    if (this.running) {
      throw new Error(`El worker no terminó dentro de ${timeoutMs} ms.`);
    }
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const candidates = await this.attempts.listDue(100);
      for (const candidate of candidates) {
        const messageId = candidate.whatsappMessageId ?? candidate.clientMessageId;
        const exists = await this.messages.exists(candidate.sessionId, messageId);
        if (exists) {
          await this.attempts.reconcileByMessageId(candidate.sessionId, messageId, "SERVER_ACK");
          metrics.increment("wa_reconciliation_total", "Message reconciliation outcomes.", { result: "confirmed" });
        } else {
          metrics.increment("wa_reconciliation_total", "Message reconciliation outcomes.", { result: "retry" });
          await this.attempts.markUnconfirmedForRetry(
            candidate.id,
            "El Worker se reinició o perdió la confirmación y no existe evidencia persistida del mensaje.",
          );
        }
        await this.campaigns.refreshStats(candidate.campaignId);
      }
    } catch (error) {
      logger.error({ error }, "Error reconciliando intentos de mensajes.");
    } finally {
      this.running = false;
    }
  }
}
