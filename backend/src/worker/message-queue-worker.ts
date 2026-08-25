import { getContentType, proto } from "@whiskeysockets/baileys";
import type { IMessageQueueRepository } from "../application/ports/repositories/message-queue.repository.js";
import type { IMessageAttemptRepository } from "../application/ports/repositories/message-attempt.repository.js";
import type { IWhatsAppMessageRepository } from "../application/ports/repositories/whatsapp-message.repository.js";
import type { ICampaignRepository } from "../application/ports/repositories/campaign.repository.js";
import type { IWhatsAppSocketRegistry } from "../application/ports/whatsapp/socket-registry.js";
import { MediaReuseService } from "../application/services/media-reuse.service.js";
import type { CampaignMessagePayload } from "../domain/campaign/campaign-message.js";
import { decodeJson } from "../shared/utils/json-buffer.js";
import { randomBetween, sleep } from "../shared/utils/delay.js";
import { logger } from "../shared/logger/logger.js";
import { retryDelaySeconds } from "../domain/queue/retry-policy.js";
import { metrics } from "../shared/observability/metrics.js";
import { TenantCapacityService } from "../application/services/tenant-capacity.service.js";
import { classifySendFailure } from "../domain/queue/send-error-classifier.js";
import { FailoverService } from "../application/services/failover.service.js";
import { IntegrationManagementService } from "../application/services/integration-management.service.js";
import { buildDispatchPlan } from "../domain/queue/dispatch-plan.js";

export class MessageQueueWorker {
  private timer?: NodeJS.Timeout;
  private dispatching = false;
  private stopped = true;
  private totalInFlight = 0;
  private readonly activeBySession = new Map<string, number>();
  private readonly inFlightTasks = new Set<Promise<void>>();
  private readonly haltedSessions = new Set<string>();
  private readonly haltedSeenAbsent = new Set<string>();
  private readonly consecutiveTransientFailures = new Map<string, number>();
  private readonly pendingStatsRefresh = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly queue: IMessageQueueRepository,
    private readonly attempts: IMessageAttemptRepository,
    private readonly messages: IWhatsAppMessageRepository,
    private readonly campaigns: ICampaignRepository,
    private readonly failover: FailoverService,
    private readonly integrations: IntegrationManagementService,
    private readonly capacity: TenantCapacityService,
    private readonly sockets: IWhatsAppSocketRegistry,
    private readonly mediaReuse: MediaReuseService,
    private readonly workerId: string,
    private readonly lockSeconds: number,
    private readonly intervalMs: number,
    private readonly sessionConcurrency: number,
    private readonly maxInFlight: number,
    private readonly delayMinMs: number,
    private readonly delayMaxMs: number,
    private readonly reconciliationGraceMs: number,
    private readonly circuitBreakerFailureThreshold: number,
    private readonly circuitBreakerRetryMinutes: number,
  ) {}

  getRuntimeSnapshot(): {
    inFlight: number;
    maxInFlight: number;
    sessionConcurrency: number;
    activeSessions: number;
    haltedSessions: number;
  } {
    return {
      inFlight: this.totalInFlight,
      maxInFlight: this.maxInFlight,
      sessionConcurrency: this.sessionConcurrency,
      activeSessions: this.activeBySession.size,
      haltedSessions: this.haltedSessions.size,
    };
  }

  start(): void {
    this.stopped = false;
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    for (const timeout of this.pendingStatsRefresh.values()) {
      clearTimeout(timeout);
    }
    this.pendingStatsRefresh.clear();
  }

  private scheduleCampaignStatsRefresh(campaignId: string): void {
    if (this.pendingStatsRefresh.has(campaignId)) return;
    const timeout = setTimeout(() => {
      this.pendingStatsRefresh.delete(campaignId);
      void this.campaigns.refreshStats(campaignId).catch((err) => {
        logger.warn({ err, campaignId }, "Error actualizando estadísticas consolidadas de campaña.");
      });
    }, 6000);
    this.pendingStatsRefresh.set(campaignId, timeout);
  }

  async stopAndWait(timeoutMs: number): Promise<void> {
    this.stop();
    const deadline = Date.now() + timeoutMs;
    while (this.inFlightTasks.size > 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (this.inFlightTasks.size > 0) {
      throw new Error(`El worker conserva ${this.inFlightTasks.size} envío(s) en vuelo después de ${timeoutMs} ms.`);
    }
  }

  private refreshHaltedSessions(sessionIds: readonly string[]): void {
    const connected = new Set(sessionIds);
    for (const sessionId of this.haltedSessions) {
      if (!connected.has(sessionId)) {
        this.haltedSeenAbsent.add(sessionId);
        continue;
      }
      if (this.haltedSeenAbsent.has(sessionId)) {
        this.haltedSessions.delete(sessionId);
        this.haltedSeenAbsent.delete(sessionId);
        logger.info({ sessionId }, "Sesión reconectada; se habilita nuevamente el despachador local.");
      }
    }
  }

  private async emitSafely(input: {
    tenantId: string;
    eventType: string;
    aggregateType?: string;
    aggregateId?: string;
    payload: Record<string, unknown>;
  }): Promise<void> {
    try {
      await this.integrations.emit(input);
    } catch (error) {
      logger.warn(
        { error, eventType: input.eventType },
        "No se pudo encolar el webhook; el envío principal continúa.",
      );
    }
  }

  private async tick(): Promise<void> {
    if (this.dispatching || this.stopped) return;
    this.dispatching = true;
    try {
      const sessionIds = this.sockets.ids();
      this.refreshHaltedSessions(sessionIds);
      const plan = buildDispatchPlan({
        sessionIds: sessionIds.filter((sessionId) => !this.haltedSessions.has(sessionId)),
        activeBySession: this.activeBySession,
        sessionConcurrency: this.sessionConcurrency,
        totalInFlight: this.totalInFlight,
        maxInFlight: this.maxInFlight,
      });
      metrics.gauge("wa_queue_inflight", "Queue messages currently being processed by this worker.", { worker: this.workerId }, this.totalInFlight);
      for (const sessionId of plan) this.launchSlot(sessionId);
    } finally {
      this.dispatching = false;
    }
  }

  private launchSlot(sessionId: string): void {
    const active = (this.activeBySession.get(sessionId) ?? 0) + 1;
    this.activeBySession.set(sessionId, active);
    this.totalInFlight += 1;
    metrics.gauge("wa_queue_session_inflight", "Queue messages currently being processed for a WhatsApp session.", { worker: this.workerId, session: sessionId }, active);
    metrics.gauge("wa_queue_inflight", "Queue messages currently being processed by this worker.", { worker: this.workerId }, this.totalInFlight);

    let task!: Promise<void>;
    task = (async () => {
      let claimed = false;
      try {
        claimed = await this.processOne(sessionId);
      } catch (error) {
        logger.error({ error, sessionId, workerId: this.workerId }, "Error no controlado en un slot de la cola.");
      } finally {
        const nextActive = Math.max(0, (this.activeBySession.get(sessionId) ?? 1) - 1);
        if (nextActive === 0) this.activeBySession.delete(sessionId);
        else this.activeBySession.set(sessionId, nextActive);
        this.totalInFlight = Math.max(0, this.totalInFlight - 1);
        this.inFlightTasks.delete(task);
        metrics.gauge("wa_queue_session_inflight", "Queue messages currently being processed for a WhatsApp session.", { worker: this.workerId, session: sessionId }, nextActive);
        metrics.gauge("wa_queue_inflight", "Queue messages currently being processed by this worker.", { worker: this.workerId }, this.totalInFlight);
        if (claimed && !this.stopped) setTimeout(() => void this.tick(), 0);
      }
    })();
    this.inFlightTasks.add(task);
  }

  private async processOne(sessionId: string): Promise<boolean> {
    if (this.haltedSessions.has(sessionId)) return false;

    const item = await this.queue.claimNext({
      sessionId,
      workerId: this.workerId,
      lockExpiresAt: new Date(Date.now() + this.lockSeconds * 1000),
    });
    if (!item) return false;
    metrics.increment("wa_queue_claimed_total", "Queue items claimed by workers.", { worker: this.workerId, session: sessionId });

    let attemptId: string | undefined;
    try {
      const attempt = await this.attempts.prepare({
        tenantId: item.tenantId,
        queueItemId: item.id,
        campaignId: item.campaignId,
        sessionId,
        clientMessageId: item.clientMessageId,
        reconcileAfter: new Date(Date.now() + this.reconciliationGraceMs),
      });
      attemptId = attempt.id;

      if (attempt.decision === "ALREADY_SENT" && attempt.whatsappMessageId) {
        await this.queue.markSent(item.id, attempt.whatsappMessageId);
        await this.capacity.recordMessageSent({ tenantId: item.tenantId, queueItemId: item.id });
        await this.campaigns.refreshStats(item.campaignId);
        this.consecutiveTransientFailures.set(sessionId, 0);
        metrics.increment("wa_messages_sent_total", "Messages confirmed as sent.", { session: sessionId, result: "reconciled" });
        await this.emitSafely({
          tenantId: item.tenantId,
          eventType: "MESSAGE_SENT",
          aggregateType: "MessageQueue",
          aggregateId: item.id,
          payload: {
            queueItemId: item.id,
            campaignId: item.campaignId,
            sessionId,
            whatsappMessageId: attempt.whatsappMessageId,
            reconciled: true,
          },
        });
        return true;
      }
      if (attempt.decision === "WAIT") {
        await this.queue.releaseForReconciliation(
          item.id,
          attempt.retryAt ?? new Date(Date.now() + this.reconciliationGraceMs),
        );
        return false;
      }

      const socket = this.sockets.get(sessionId);
      const digits = item.recipientE164?.replace(/\D/g, "");
      if (!digits) throw new Error("El contacto no tiene número E.164 normalizado.");

      let destinationJid = item.recipientJid;
      if (!destinationJid) {
        const results = await socket.onWhatsApp(digits);
        const target = results?.find((entry) => entry.exists);
        if (!target?.jid) throw new Error("El número no está registrado en WhatsApp.");
        destinationJid = target.jid;
        await this.queue.setRecipientJid(item.id, target.jid);
      }

      const resolvedDestinationJid = destinationJid;
      if (!resolvedDestinationJid) throw new Error("No se pudo resolver el JID de destino.");

      const payload = decodeJson<CampaignMessagePayload>(item.payload);
      await sleep(randomBetween(this.delayMinMs, this.delayMaxMs));

      if (this.haltedSessions.has(sessionId)) {
        await this.queue.releaseForReconciliation(item.id, new Date(Date.now() + 5000));
        return false;
      }

      let sentMessageId: string;
      if (item.mediaAssetId) {
        sentMessageId = await this.mediaReuse.sendPrepared({
          mediaAssetId: item.mediaAssetId,
          sessionId,
          destinationJid: resolvedDestinationJid,
          caption: payload.caption ?? payload.text,
          clientMessageId: item.clientMessageId,
        });
      } else {
        const sent = await socket.sendMessage(resolvedDestinationJid, { text: payload.text }, { messageId: item.clientMessageId });
        if (!sent?.key.id) throw new Error("WhatsApp no devolvió identificador del mensaje.");
        sentMessageId = sent.key.id;
        if (sent.message) {
          await this.messages.save({
            tenantId: item.tenantId,
            sessionId,
            campaignId: item.campaignId,
            queueItemId: item.id,
            whatsappMessageId: sentMessageId,
            remoteJid: resolvedDestinationJid,
            direction: "OUTBOUND",
            messageType: getContentType(sent.message) ?? "conversation",
            status: "SUBMITTED",
            fromMe: true,
            payload: Buffer.from(proto.Message.encode(sent.message).finish()),
            messageTimestamp: new Date(),
          });
        }
      }

      await this.attempts.markSubmitted(attempt.id, sentMessageId);
      await this.queue.markSent(item.id, sentMessageId);
      await this.attempts.markCompleted(attempt.id, sentMessageId);
      await this.capacity.recordMessageSent({ tenantId: item.tenantId, queueItemId: item.id });
      void this.campaigns.incrementSent(item.campaignId);
      this.scheduleCampaignStatsRefresh(item.campaignId);
      this.consecutiveTransientFailures.set(sessionId, 0);
      metrics.increment("wa_messages_sent_total", "Messages confirmed as sent.", { session: sessionId, result: "submitted" });
      await this.emitSafely({
        tenantId: item.tenantId,
        eventType: "MESSAGE_SENT",
        aggregateType: "MessageQueue",
        aggregateId: item.id,
        payload: {
          queueItemId: item.id,
          campaignId: item.campaignId,
          sessionId,
          whatsappMessageId: sentMessageId,
        },
      });
      return true;
    } catch (error) {
      const failure = classifySendFailure(error);
      if (attemptId) await this.attempts.markFailed(attemptId, failure.code, failure.message);

      if (failure.kind === "RECIPIENT_PERMANENT") {
        this.consecutiveTransientFailures.set(sessionId, 0);
        await this.queue.markRetryOrDeadLetter({
          id: item.id,
          errorCode: failure.code,
          errorMessage: failure.message,
          retryAt: new Date(),
          forceDeadLetter: true,
        });
        void this.campaigns.incrementFailed(item.campaignId);
        this.scheduleCampaignStatsRefresh(item.campaignId);
        metrics.increment("wa_messages_failed_total", "Message send failures.", { session: sessionId, code: failure.code });
        logger.warn({ error, queueItemId: item.id, sessionId, classification: failure.kind }, "Destinatario enviado directamente a DLQ.");
        await this.emitSafely({
          tenantId: item.tenantId,
          eventType: "MESSAGE_FAILED",
          aggregateType: "MessageQueue",
          aggregateId: item.id,
          payload: {
            queueItemId: item.id,
            campaignId: item.campaignId,
            sessionId,
            code: failure.code,
            message: failure.message,
            final: true,
          },
        });
        return true;
      }

      if (failure.kind === "SESSION_FATAL") {
        this.haltedSessions.add(sessionId);
        const result = await this.failover.handleFatalFailure(
          sessionId,
          failure.code,
          failure.message,
          failure.statusCode,
        );
        this.consecutiveTransientFailures.set(sessionId, 0);
        for (const campaignId of result.campaignIds) {
          await this.campaigns.refreshStats(campaignId);
        }
        metrics.increment("wa_session_quarantine_total", "Sessions quarantined after fatal send failures.", { session: sessionId, code: failure.code });
        logger.error({
          error,
          queueItemId: item.id,
          sessionId,
          heldMessages: result.heldMessages,
          campaignIds: result.campaignIds,
          classification: failure.kind,
        }, "Sesión puesta en cuarentena por un error grave.");
        await this.emitSafely({
          tenantId: item.tenantId,
          eventType: "SESSION_QUARANTINED",
          aggregateType: "WhatsAppSession",
          aggregateId: sessionId,
          payload: {
            sessionId,
            code: failure.code,
            message: failure.message,
            heldMessages: result.heldMessages,
            campaignIds: result.campaignIds,
          },
        });
        return false;
      }

      const failures = (this.consecutiveTransientFailures.get(sessionId) ?? 0) + 1;
      this.consecutiveTransientFailures.set(sessionId, failures);

      if (failures >= this.circuitBreakerFailureThreshold) {
        const result = await this.failover.handleTechnicalFailure(
          sessionId,
          failure.code,
          failure.message,
        );
        this.consecutiveTransientFailures.set(sessionId, 0);
        for (const campaign of result.campaigns) {
          await this.campaigns.refreshStats(campaign.campaignId);
        }
        metrics.increment("wa_automatic_failover_total", "Automatic failovers after technical failures.", {
          session: sessionId,
          code: failure.code,
        });
        logger.warn({
          error,
          queueItemId: item.id,
          sessionId,
          totalMoved: result.totalMoved,
          campaigns: result.campaigns,
          classification: failure.kind,
          failures,
        }, "Umbral técnico alcanzado; se ejecutó el failover automático.");
        await this.emitSafely({
          tenantId: item.tenantId,
          eventType: "AUTOMATIC_FAILOVER_EXECUTED",
          aggregateType: "WhatsAppSession",
          aggregateId: sessionId,
          payload: {
            sessionId,
            code: failure.code,
            totalMoved: result.totalMoved,
            campaigns: result.campaigns,
          },
        });
        return false;
      }

      const retrySeconds = retryDelaySeconds(item.attemptCount);
      await this.queue.markRetryOrDeadLetter({
        id: item.id,
        errorCode: failure.code,
        errorMessage: failure.message,
        retryAt: new Date(Date.now() + retrySeconds * 1000),
      });
      this.scheduleCampaignStatsRefresh(item.campaignId);
      metrics.increment("wa_messages_failed_total", "Message send failures.", { session: sessionId, code: failure.code });
      logger.error({ error, queueItemId: item.id, sessionId, classification: failure.kind, failures }, "Error temporal enviando mensaje de cola.");
      return false;
    }
  }
}
