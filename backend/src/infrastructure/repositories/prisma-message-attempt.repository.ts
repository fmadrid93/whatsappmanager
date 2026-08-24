import { Prisma, type PrismaClient } from "@prisma/client";
import { encodeJson } from "../../shared/utils/json-buffer.js";
import type {
  AttemptPreparation,
  IMessageAttemptRepository,
  ReconciliationCandidate,
} from "../../application/ports/repositories/message-attempt.repository.js";

const TX_OPTS = { timeout: 30000, maxWait: 15000 };

function currentPeriod(date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export class PrismaMessageAttemptRepository implements IMessageAttemptRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async prepare(input: {
    tenantId: string;
    queueItemId: string;
    campaignId: string;
    sessionId: string;
    clientMessageId: string;
    reconcileAfter: Date;
  }): Promise<AttemptPreparation> {
    return this.prisma.$transaction(async (tx) => {
      const unresolved = await tx.messageAttempt.findFirst({
        where: {
          queueItemId: input.queueItemId,
          state: { in: ["STARTED", "SUBMITTED", "ACKNOWLEDGED", "COMPLETED"] },
        },
        orderBy: { createdAt: "desc" },
      });

      if (unresolved) {
        if (["COMPLETED", "ACKNOWLEDGED"].includes(unresolved.state) && unresolved.whatsappMessageId) {
          return {
            id: unresolved.id,
            decision: "ALREADY_SENT" as const,
            whatsappMessageId: unresolved.whatsappMessageId,
          };
        }
        if (unresolved.state === "SUBMITTED" && unresolved.whatsappMessageId) {
          return {
            id: unresolved.id,
            decision: "ALREADY_SENT" as const,
            whatsappMessageId: unresolved.whatsappMessageId,
          };
        }
        if (unresolved.reconcileAfter && unresolved.reconcileAfter > new Date()) {
          return {
            id: unresolved.id,
            decision: "WAIT" as const,
            retryAt: unresolved.reconcileAfter,
            whatsappMessageId: unresolved.whatsappMessageId ?? undefined,
          };
        }
        await tx.messageAttempt.update({
          where: { id: unresolved.id },
          data: {
            state: "FAILED",
            failedAt: new Date(),
            reconcileAfter: null,
            errorCode: "UNRESOLVED_TIMEOUT",
            errorMessage: "El intento anterior no concluyó y fue cerrado para reintento.",
          },
        });
      }

      const created = await tx.messageAttempt.create({
        data: {
          tenantId: input.tenantId,
          queueItemId: input.queueItemId,
          campaignId: input.campaignId,
          sessionId: input.sessionId,
          clientMessageId: input.clientMessageId,
          state: "STARTED",
          reconcileAfter: input.reconcileAfter,
        },
      });

      return {
        id: created.id,
        decision: "SEND" as const,
      };
    }, TX_OPTS);
  }

  async markSubmitted(attemptId: string, whatsappMessageId: string): Promise<void> {
    await this.prisma.messageAttempt.update({
      where: { id: attemptId },
      data: {
        state: "SUBMITTED",
        whatsappMessageId,
        submittedAt: new Date(),
        reconcileAfter: new Date(Date.now() + 90_000),
      },
    });
  }

  async markCompleted(attemptId: string, whatsappMessageId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const attempt = await tx.messageAttempt.update({
        where: { id: attemptId },
        data: {
          state: "COMPLETED",
          whatsappMessageId,
          completedAt: new Date(),
          acknowledgedAt: new Date(),
          reconcileAfter: null,
        },
      });
      const transitioned = await tx.messageQueue.updateMany({
        where: { id: attempt.queueItemId, status: { notIn: ["SENT", "CANCELLED", "DEAD_LETTER"] } },
        data: {
          status: "SENT",
          sentAt: new Date(),
          sentMessageId: whatsappMessageId,
          lockedBy: null,
          lockExpiresAt: null,
          lastErrorCode: null,
          lastErrorMessage: null,
        },
      });
      if (transitioned.count === 1) {
        await this.recordSentSideEffects(tx, attempt.tenantId, attempt.queueItemId, attempt.campaignId, attempt.sessionId, whatsappMessageId);
      }
    }, TX_OPTS);
  }

  async markFailed(attemptId: string, errorCode: string, errorMessage: string): Promise<void> {
    await this.prisma.messageAttempt.update({
      where: { id: attemptId },
      data: {
        state: "FAILED",
        failedAt: new Date(),
        reconcileAfter: null,
        errorCode,
        errorMessage: errorMessage.slice(0, 2000),
      },
    });
  }

  async reconcileByMessageId(sessionId: string, whatsappMessageId: string, status: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const attempt = await tx.messageAttempt.findFirst({
        where: {
          sessionId,
          OR: [{ whatsappMessageId }, { clientMessageId: whatsappMessageId }],
        },
      });
      if (!attempt) return false;

      await tx.messageAttempt.update({
        where: { id: attempt.id },
        data: {
          whatsappMessageId,
          state: status === "FAILED" ? "FAILED" : "ACKNOWLEDGED",
          acknowledgedAt: status === "FAILED" ? null : new Date(),
          failedAt: status === "FAILED" ? new Date() : null,
          reconcileAfter: null,
        },
      });

      if (status !== "FAILED") {
        const transitioned = await tx.messageQueue.updateMany({
          where: { id: attempt.queueItemId, status: { in: ["PENDING", "PROCESSING"] } },
          data: {
            status: "SENT",
            sentAt: new Date(),
            sentMessageId: whatsappMessageId,
            lockedBy: null,
            lockExpiresAt: null,
            lastErrorCode: null,
            lastErrorMessage: null,
          },
        });
        if (transitioned.count === 1) {
          await this.recordSentSideEffects(tx, attempt.tenantId, attempt.queueItemId, attempt.campaignId, attempt.sessionId, whatsappMessageId);
        }
      }
      return true;
    }, TX_OPTS);
  }

  private async recordSentSideEffects(
    tx: Prisma.TransactionClient,
    tenantId: string,
    queueItemId: string,
    campaignId: string,
    sessionId: string,
    whatsappMessageId: string,
  ): Promise<void> {
    await tx.outboxEvent.create({
      data: {
        tenantId,
        aggregateType: "MessageQueue",
        aggregateId: queueItemId,
        eventType: "MESSAGE_SENT",
        payload: encodeJson({ queueItemId, campaignId, tenantId, sessionId, whatsappMessageId }),
      },
    });
    const period = currentPeriod();
    const existing = await tx.tenantUsageEvent.findUnique({
      where: {
        tenantId_eventType_referenceId: {
          tenantId,
          eventType: "MESSAGE_SENT",
          referenceId: queueItemId,
        },
      },
    });
    if (!existing) {
      await tx.tenantUsageMonthly.upsert({
        where: { tenantId_period: { tenantId, period } },
        create: { tenantId, period, messagesSent: 1 },
        update: { messagesSent: { increment: 1 } },
      });
      await tx.tenantUsageEvent.create({
        data: { tenantId, period, eventType: "MESSAGE_SENT", referenceId: queueItemId, units: 1 },
      });
    }
  }

  async listDue(limit: number): Promise<ReconciliationCandidate[]> {
    const rows = await this.prisma.messageAttempt.findMany({
      where: {
        state: { in: ["STARTED", "SUBMITTED"] },
        reconcileAfter: { lte: new Date() },
      },
      orderBy: { reconcileAfter: "asc" },
      take: limit,
    });
    return rows.map((row) => ({
      id: row.id,
      queueItemId: row.queueItemId,
      campaignId: row.campaignId,
      sessionId: row.sessionId,
      clientMessageId: row.clientMessageId,
      whatsappMessageId: row.whatsappMessageId ?? undefined,
    }));
  }

  async markUnconfirmedForRetry(attemptId: string, errorMessage: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const attempt = await tx.messageAttempt.update({
        where: { id: attemptId },
        data: {
          state: "FAILED",
          failedAt: new Date(),
          reconcileAfter: null,
          errorCode: "UNCONFIRMED_AFTER_CRASH",
          errorMessage: errorMessage.slice(0, 2000),
        },
      });
      await tx.messageQueue.updateMany({
        where: { id: attempt.queueItemId, status: { in: ["PENDING", "PROCESSING"] } },
        data: {
          status: "PENDING",
          processingAt: null,
          lockedBy: null,
          lockExpiresAt: null,
          availableAt: new Date(Date.now() + 5_000),
          lastErrorCode: "RECONCILIATION_REQUIRED",
          lastErrorMessage: "No se encontró confirmación del intento anterior; se habilitó un reintento controlado.",
        },
      });
    }, TX_OPTS);
  }
}
