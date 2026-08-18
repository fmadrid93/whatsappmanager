import type {
  AutomaticFailoverResult,
  IMessageQueueRepository,
  SessionQuarantineResult,
} from "../ports/repositories/message-queue.repository.js";
import type { ISessionRepository } from "../ports/repositories/session.repository.js";
import { logger } from "../../shared/logger/logger.js";

export class FailoverService {
  constructor(
    private readonly sessions: ISessionRepository,
    private readonly queue: IMessageQueueRepository,
    private readonly automaticEnabled: boolean,
    private readonly automaticWaitSeconds: number,
    private readonly automaticMaxTargets: number,
    private readonly quarantineMinutes: number,
  ) {}

  async handleTechnicalFailure(
    sessionId: string,
    errorCode: string,
    errorMessage: string,
  ): Promise<AutomaticFailoverResult> {
    if (!this.automaticEnabled) {
      const campaignIds = await this.queue.pauseCampaignsForSession({
        sessionId,
        errorCode,
        errorMessage,
        retryAt: new Date(Date.now() + this.automaticWaitSeconds * 1000),
      });
      return {
        sourceSessionId: sessionId,
        totalMoved: 0,
        campaigns: campaignIds.map((campaignId) => ({
          campaignId,
          movedMessages: 0,
          targetSessionIds: [],
          pausedBecauseNoReplacement: true,
        })),
      };
    }

    const result = await this.queue.autoFailoverTechnical({
      sessionId,
      errorCode,
      errorMessage,
      availableAt: new Date(Date.now() + this.automaticWaitSeconds * 1000),
      maxTargets: this.automaticMaxTargets,
    });

    logger.warn({
      sessionId,
      errorCode,
      totalMoved: result.totalMoved,
      campaigns: result.campaigns,
    }, "Failover automático ejecutado por una falla técnica.");

    return result;
  }

  async handleFatalFailure(
    sessionId: string,
    errorCode: string,
    errorMessage: string,
    connectionCode?: number,
  ): Promise<SessionQuarantineResult> {
    await this.sessions.quarantine(sessionId, `${errorCode}: ${errorMessage}`, connectionCode);
    const result = await this.queue.quarantineSessionQueue({
      sessionId,
      errorCode,
      errorMessage,
      availableAt: new Date(Date.now() + this.quarantineMinutes * 60_000),
    });

    logger.error({
      sessionId,
      errorCode,
      heldMessages: result.heldMessages,
      campaignIds: result.campaignIds,
      pausedCampaignIds: result.pausedCampaignIds,
    }, "Sesión puesta en cuarentena; los pendientes no fueron transferidos automáticamente.");

    return result;
  }

  async handleLoggedOut(sessionId: string): Promise<void> {
    const session = await this.sessions.findById(sessionId);
    await this.handleFatalFailure(
      sessionId,
      "SESSION_LOGGED_OUT",
      session?.lastConnectionError || "WhatsApp cerró la sesión. Se requiere revisión manual.",
      session?.lastConnectionCode,
    );
  }
}
