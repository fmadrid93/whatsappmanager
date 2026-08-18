import type { ICampaignRepository } from "../application/ports/repositories/campaign.repository.js";
import type { IMediaPreparationRepository } from "../application/ports/repositories/media-preparation.repository.js";
import type { IWhatsAppSocketRegistry } from "../application/ports/whatsapp/socket-registry.js";
import { MediaReuseService } from "../application/services/media-reuse.service.js";
import { logger } from "../shared/logger/logger.js";

export class CampaignPreparationWorker {
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly campaigns: ICampaignRepository,
    private readonly preparations: IMediaPreparationRepository,
    private readonly mediaReuse: MediaReuseService,
    private readonly sockets: IWhatsAppSocketRegistry,
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
    if (this.running) {
      throw new Error(`El worker no terminó dentro de ${timeoutMs} ms.`);
    }
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const campaigns = await this.campaigns.listPreparing(25);

      // Crea de forma idempotente un trabajo por sesión. Cada réplica procesa
      // solamente los trabajos de los sockets que posee localmente.
      for (const campaign of campaigns) {
        const sessionIds = campaign.sessionIds ?? [];
        if (sessionIds.length === 0) {
          logger.error({ campaignId: campaign.id }, "La campaña no tiene sesiones habilitadas.");
          continue;
        }

        if (!campaign.mediaAssetId) {
          if (await this.campaigns.setRunning(campaign.id)) {
            logger.info({ campaignId: campaign.id }, "Campaña de texto en ejecución.");
          }
          continue;
        }

        await this.preparations.ensureCampaignJobs({
          tenantId: campaign.tenantId,
          campaignId: campaign.id,
          mediaAssetId: campaign.mediaAssetId,
          sessionIds,
        });
      }

      await Promise.all(this.sockets.ids().map((sessionId) => this.prepareOne(sessionId)));

      // Cualquier réplica puede finalizar; setRunning es condicional y el
      // borrado del objeto es idempotente.
      for (const campaign of campaigns) {
        if (!campaign.mediaAssetId) continue;
        if (!(await this.preparations.areAllPrepared(campaign.id))) continue;

        await this.mediaReuse.finalizeAsset(campaign.mediaAssetId);
        if (await this.campaigns.setRunning(campaign.id)) {
          logger.info({ campaignId: campaign.id }, "Campaña multimedia preparada y en ejecución.");
        }
      }
    } catch (error) {
      logger.error({ error }, "Error en el coordinador de preparación multimedia.");
    } finally {
      this.running = false;
    }
  }

  private async prepareOne(sessionId: string): Promise<void> {
    const job = await this.preparations.claimNextForSession({
      sessionId,
      workerId: this.workerId,
      lockExpiresAt: new Date(Date.now() + this.lockSeconds * 1000),
    });
    if (!job) return;

    try {
      await this.mediaReuse.prepareForSession(job.mediaAssetId, job.sessionId);
      await this.preparations.markPrepared(job.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error desconocido preparando multimedia.";
      await this.preparations.markRetryOrFailed({
        id: job.id,
        errorMessage: message,
        retryAt: new Date(Date.now() + Math.min(300, 10 * Math.max(1, job.attemptCount)) * 1000),
      });
      logger.error({ error, jobId: job.id, sessionId }, "No se pudo preparar la multimedia.");
    }
  }
}
