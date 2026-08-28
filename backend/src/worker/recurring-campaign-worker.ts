import type { RecurringCampaignService } from "../application/services/recurring-campaign.service.js";
import { logger } from "../shared/logger/logger.js";
import { metrics } from "../shared/observability/metrics.js";

export class RecurringCampaignWorker {
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly recurringCampaigns: RecurringCampaignService,
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
      const due = await this.recurringCampaigns.listDue(new Date());
      for (const record of due) {
        try {
          await this.recurringCampaigns.runOnce(record);
          metrics.increment("wa_recurring_campaign_runs_total", "Corridas de campañas recurrentes.", {
            result: "ok",
          });
        } catch (error) {
          logger.error({ error, recurringCampaignId: record.id }, "Error ejecutando campaña recurrente.");
          metrics.increment("wa_recurring_campaign_runs_total", "Corridas de campañas recurrentes.", {
            result: "error",
          });
        }
      }
    } catch (error) {
      logger.error({ error }, "Error buscando campañas recurrentes pendientes de ejecución.");
    } finally {
      this.running = false;
    }
  }
}
