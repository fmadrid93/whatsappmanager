import crypto from "node:crypto";
import { IntegrationManagementService } from "../application/services/integration-management.service.js";
import type { ClaimedWebhookDelivery } from "../application/ports/repositories/integration.repository.js";
import { logger } from "../shared/logger/logger.js";

export class WebhookDeliveryWorker {
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly integrations: IntegrationManagementService,
    private readonly workerId: string,
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
    if (this.running) throw new Error(`El worker de webhooks no terminó dentro de ${timeoutMs} ms.`);
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      for (let index = 0; index < 10; index += 1) {
        const delivery = await this.integrations.claimNextDelivery(this.workerId, this.lockSeconds);
        if (!delivery) break;
        await this.deliver(delivery);
      }
    } finally {
      this.running = false;
    }
  }

  private async deliver(delivery: ClaimedWebhookDelivery): Promise<void> {
    let status: number | undefined;
    let body = "";
    try {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const payload = delivery.payload.toString("utf8");
      const secret = this.integrations.decryptWebhookSecret(delivery.secretPayload);
      const signature = crypto.createHmac("sha256", secret).update(`${timestamp}.${payload}`, "utf8").digest("hex");
      const response = await fetch(delivery.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": "WhatsAppSaaS-Webhook/1.0",
          "x-webhook-event": delivery.eventType,
          "x-webhook-delivery": delivery.id,
          "x-webhook-timestamp": timestamp,
          "x-webhook-signature": `sha256=${signature}`,
        },
        body: payload,
        signal: AbortSignal.timeout(15_000),
      });
      status = response.status;
      body = (await response.text()).slice(0, 2000);
      if (response.status < 200 || response.status >= 300) {
        throw new Error(`El webhook respondió HTTP ${response.status}.`);
      }
      await this.integrations.markDeliverySuccess({ id: delivery.id, responseStatus: response.status, responseBody: body });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const seconds = Math.min(300, 10 * (2 ** Math.max(delivery.attemptCount - 1, 0)));
      await this.integrations.markDeliveryFailure({
        id: delivery.id,
        responseStatus: status,
        responseBody: body,
        error: message,
        retryAt: new Date(Date.now() + seconds * 1000),
      });
      logger.warn({ error, webhookDeliveryId: delivery.id, webhookId: delivery.webhookId }, "Falló una entrega de webhook.");
    }
  }
}
