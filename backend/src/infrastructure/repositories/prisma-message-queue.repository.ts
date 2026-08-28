import crypto from "node:crypto";
import { Prisma, type MessageQueue, type PrismaClient } from "@prisma/client";
import type {
  AutomaticFailoverResult,
  CampaignMessageRecord,
  CampaignPerformanceStats,
  CampaignRecoveryResult,
  CampaignRecoveryStats,
  IMessageQueueRepository,
  SessionQuarantineResult,
} from "../../application/ports/repositories/message-queue.repository.js";
import type { QueueItemRecord } from "../../domain/queue/queue-item.js";
import { encodeJson } from "../../shared/utils/json-buffer.js";
import { distributeRoundRobin } from "../../domain/queue/failover-distribution.js";
import { HttpError } from "../../shared/errors/http-error.js";

function mapQueue(row: MessageQueue): QueueItemRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    campaignId: row.campaignId,
    assignedSessionId: row.assignedSessionId ?? undefined,
    mediaAssetId: row.mediaAssetId ?? undefined,
    contactName: row.contactName ?? undefined,
    recipientRaw: row.recipientRaw,
    recipientE164: row.recipientE164 ?? undefined,
    recipientJid: row.recipientJid ?? undefined,
    messageType: row.messageType,
    payload: row.payload ? Buffer.from(row.payload) : undefined,
    status: row.status,
    priority: row.priority,
    attemptCount: row.attemptCount,
    maxAttempts: row.maxAttempts,
    idempotencyKey: row.idempotencyKey,
    clientMessageId: row.clientMessageId ?? row.idempotencyKey.slice(0, 32).toUpperCase(),
  };
}

const HELD_SESSION_QUARANTINED = "HELD_SESSION_QUARANTINED";

function chunkIds(ids: string[], size = 500): string[][] {
  const chunks: string[][] = [];
  for (let index = 0; index < ids.length; index += size) {
    chunks.push(ids.slice(index, index + size));
  }
  return chunks;
}

function technicalRecoveryWhere(input: { tenantId: string; campaignId: string }, now: Date): Prisma.MessageQueueWhereInput {
  return {
    tenantId: input.tenantId,
    campaignId: input.campaignId,
    AND: [
      {
        OR: [
          { lastErrorCode: null },
          { lastErrorCode: { not: HELD_SESSION_QUARANTINED } },
        ],
      },
      {
        OR: [
          { status: "PENDING" },
          {
            status: "PROCESSING",
            OR: [
              { lockExpiresAt: null },
              { lockExpiresAt: { lt: now } },
            ],
          },
        ],
      },
      {
        OR: [
          { assignedSessionId: null },
          { assignedSession: { is: { deletedAt: { not: null } } } },
          { assignedSession: { is: { status: { not: "CONNECTED" } } } },
          { assignedSession: { is: { leaseExpiresAt: null } } },
          { assignedSession: { is: { leaseExpiresAt: { lte: now } } } },
          { lastErrorCode: "AUTO_FAILOVER_NO_REPLACEMENT" },
        ],
      },
    ],
  };
}

export class PrismaMessageQueueRepository implements IMessageQueueRepository {
  private readonly postgres: boolean;

  constructor(private readonly prisma: PrismaClient, databaseUrl = process.env.DATABASE_URL ?? "") {
    this.postgres = databaseUrl.startsWith("postgresql://") || databaseUrl.startsWith("postgres://");
  }

  async listByCampaign(input: {
    tenantId: string;
    campaignId: string;
    status?: string;
    take: number;
    skip: number;
  }): Promise<{ items: CampaignMessageRecord[]; total: number }> {
    const where: Prisma.MessageQueueWhereInput = {
      tenantId: input.tenantId,
      campaignId: input.campaignId,
      ...(input.status ? { status: input.status } : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.messageQueue.findMany({
        where,
        orderBy: [{ createdAt: "asc" }],
        skip: input.skip,
        take: input.take,
        select: {
          id: true,
          campaignId: true,
          assignedSessionId: true,
          contactName: true,
          recipientRaw: true,
          recipientE164: true,
          status: true,
          attemptCount: true,
          maxAttempts: true,
          sentMessageId: true,
          lastErrorCode: true,
          lastErrorMessage: true,
          createdAt: true,
          updatedAt: true,
          sentAt: true,
          failedAt: true,
        },
      }),
      this.prisma.messageQueue.count({ where }),
    ]);

    return {
      total,
      items: rows.map((row) => ({
        id: row.id,
        campaignId: row.campaignId,
        assignedSessionId: row.assignedSessionId ?? undefined,
        contactName: row.contactName ?? undefined,
        recipientRaw: row.recipientRaw,
        recipientE164: row.recipientE164 ?? undefined,
        status: row.status,
        attemptCount: row.attemptCount,
        maxAttempts: row.maxAttempts,
        sentMessageId: row.sentMessageId ?? undefined,
        lastErrorCode: row.lastErrorCode ?? undefined,
        lastErrorMessage: row.lastErrorMessage ?? undefined,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        sentAt: row.sentAt ?? undefined,
        failedAt: row.failedAt ?? undefined,
      })),
    };
  }

  async getCampaignPerformance(input: {
    tenantId: string;
    campaignId: string;
    since: Date;
  }): Promise<CampaignPerformanceStats> {
    const base: Prisma.MessageQueueWhereInput = {
      tenantId: input.tenantId,
      campaignId: input.campaignId,
    };
    const heldCode = "HELD_SESSION_QUARANTINED";

    const [total, pending, processing, sent, failed, held, sentLastMinute, failedLastMinute] = await this.prisma.$transaction([
      this.prisma.messageQueue.count({ where: base }),
      this.prisma.messageQueue.count({ where: { ...base, status: "PENDING", OR: [{ lastErrorCode: null }, { lastErrorCode: { not: heldCode } }] } }),
      this.prisma.messageQueue.count({ where: { ...base, status: "PROCESSING", OR: [{ lastErrorCode: null }, { lastErrorCode: { not: heldCode } }] } }),
      this.prisma.messageQueue.count({ where: { ...base, status: "SENT" } }),
      this.prisma.messageQueue.count({ where: { ...base, status: { in: ["FAILED", "DEAD_LETTER"] } } }),
      this.prisma.messageQueue.count({ where: { ...base, status: { in: ["PENDING", "PROCESSING"] }, lastErrorCode: heldCode } }),
      this.prisma.messageQueue.count({ where: { ...base, status: "SENT", sentAt: { gte: input.since } } }),
      this.prisma.messageQueue.count({ where: { ...base, status: { in: ["FAILED", "DEAD_LETTER"] }, failedAt: { gte: input.since } } }),
    ]);

    return { total, pending, processing, sent, failed, held, sentLastMinute, failedLastMinute };
  }

  async getCampaignRecoveryStats(input: {
    tenantId: string;
    campaignId: string;
  }): Promise<CampaignRecoveryStats> {
    const now = new Date();
    const openWhere: Prisma.MessageQueueWhereInput = {
      tenantId: input.tenantId,
      campaignId: input.campaignId,
      status: { in: ["PENDING", "PROCESSING"] },
    };
    const safeErrorWhere: Prisma.MessageQueueWhereInput = {
      OR: [
        { lastErrorCode: null },
        { lastErrorCode: { not: HELD_SESSION_QUARANTINED } },
      ],
    };

    const [openMessages, recoverableMessages, heldRestrictionMessages, inFlightLockedMessages] = await this.prisma.$transaction([
      this.prisma.messageQueue.count({ where: openWhere }),
      this.prisma.messageQueue.count({ where: technicalRecoveryWhere(input, now) }),
      this.prisma.messageQueue.count({
        where: { ...openWhere, lastErrorCode: HELD_SESSION_QUARANTINED },
      }),
      this.prisma.messageQueue.count({
        where: {
          ...openWhere,
          status: "PROCESSING",
          lockExpiresAt: { gt: now },
          AND: [safeErrorWhere],
        },
      }),
    ]);

    return {
      openMessages,
      recoverableMessages,
      heldRestrictionMessages,
      inFlightLockedMessages,
    };
  }

  async recoverTechnicalPending(input: {
    tenantId: string;
    campaignId: string;
    targetSessionIds: string[];
    availableAt: Date;
  }): Promise<CampaignRecoveryResult> {
    const targetSessionIds = [...new Set(input.targetSessionIds)];
    if (targetSessionIds.length === 0) {
      throw new HttpError(400, "Selecciona al menos una sesión conectada para la recuperación.");
    }

    const campaign = await this.prisma.campaign.findFirst({
      where: { id: input.campaignId, tenantId: input.tenantId },
      select: { id: true },
    });
    if (!campaign) throw new HttpError(404, "Campaña no encontrada.");

    const targets = await this.prisma.campaignSession.findMany({
      where: {
        campaignId: input.campaignId,
        isEnabled: true,
        sessionId: { in: targetSessionIds },
        session: {
          tenantId: input.tenantId,
          deletedAt: null,
          status: "CONNECTED",
        },
      },
      select: { sessionId: true },
    });
    const validTargetIds = targets.map((item) => item.sessionId);
    if (validTargetIds.length !== targetSessionIds.length) {
      throw new HttpError(409, "Una o más sesiones de recuperación ya no están conectadas o no están habilitadas en la campaña.");
    }

    const now = new Date();
    const recoverable = await this.prisma.messageQueue.findMany({
      where: technicalRecoveryWhere(input, now),
      orderBy: [{ createdAt: "asc" }],
      select: { id: true },
    });
    const [openMessages, heldRestrictionMessages, inFlightLockedMessages] = await Promise.all([
      this.prisma.messageQueue.count({
        where: {
          tenantId: input.tenantId,
          campaignId: input.campaignId,
          status: { in: ["PENDING", "PROCESSING"] },
        },
      }),
      this.prisma.messageQueue.count({
        where: {
          tenantId: input.tenantId,
          campaignId: input.campaignId,
          status: { in: ["PENDING", "PROCESSING"] },
          lastErrorCode: HELD_SESSION_QUARANTINED,
        },
      }),
      this.prisma.messageQueue.count({
        where: {
          tenantId: input.tenantId,
          campaignId: input.campaignId,
          status: "PROCESSING",
          lockExpiresAt: { gt: now },
          OR: [
            { lastErrorCode: null },
            { lastErrorCode: { not: HELD_SESSION_QUARANTINED } },
          ],
        },
      }),
    ]);

    let movedMessages = 0;
    const assignments = distributeRoundRobin(recoverable, validTargetIds);
    for (const assignment of assignments) {
      for (const ids of chunkIds(assignment.items.map((item) => item.id))) {
        const moved = await this.prisma.messageQueue.updateMany({
          where: {
            id: { in: ids },
            AND: [technicalRecoveryWhere(input, now)],
          },
          data: {
            assignedSessionId: assignment.targetSessionId,
            status: "PENDING",
            processingAt: null,
            lockedBy: null,
            lockExpiresAt: null,
            availableAt: input.availableAt,
            lastErrorCode: "MANUAL_RECOVERY_TECHNICAL",
            lastErrorMessage: "Reasignado manualmente después de una falla técnica. Los mensajes retenidos por cuarentena no se transfieren.",
          },
        });
        movedMessages += moved.count;
      }
    }

    return {
      openMessages,
      recoverableMessages: recoverable.length,
      heldRestrictionMessages,
      inFlightLockedMessages,
      movedMessages,
      untouchedOpenMessages: Math.max(0, openMessages - heldRestrictionMessages - movedMessages),
      targetSessionIds: validTargetIds,
    };
  }

  async claimNext(input: {
    sessionId: string;
    workerId: string;
    lockExpiresAt: Date;
  }): Promise<QueueItemRecord | null> {
    await this.recoverExpired(input.sessionId);
    return this.postgres ? this.claimPostgres(input) : this.claimPortable(input);
  }

  private async recoverExpired(sessionId: string): Promise<void> {
    const now = new Date();
    await this.prisma.messageQueue.updateMany({
      where: {
        assignedSessionId: sessionId,
        status: "PROCESSING",
        lockExpiresAt: { lt: now },
      },
      data: {
        status: "PENDING",
        processingAt: null,
        lockedBy: null,
        lockExpiresAt: null,
        availableAt: now,
      },
    });
  }

  private async claimPostgres(input: {
    sessionId: string;
    workerId: string;
    lockExpiresAt: Date;
  }): Promise<QueueItemRecord | null> {
    const now = new Date();
    const clientMessageId = crypto.randomUUID().replaceAll("-", "").toUpperCase();
    const rows = (await this.prisma.$transaction(async (tx) => tx.$queryRaw(Prisma.sql`
      WITH candidate AS (
        SELECT mq.id
        FROM "MessageQueue" mq
        INNER JOIN "Campaign" c ON c.id = mq."campaignId"
        INNER JOIN "WhatsAppSession" s ON s.id = mq."assignedSessionId"
        WHERE mq."assignedSessionId" = ${input.sessionId}::uuid
          AND mq.status = 'PENDING'
          AND mq."availableAt" <= ${now}
          AND c.status = 'RUNNING'
          AND s.status = 'CONNECTED'
          AND s."deletedAt" IS NULL
          AND (mq."lockExpiresAt" IS NULL OR mq."lockExpiresAt" < ${now})
        ORDER BY mq.priority ASC, mq."createdAt" ASC
        FOR UPDATE OF mq SKIP LOCKED
        LIMIT 1
      )
      UPDATE "MessageQueue" mq
      SET status = 'PROCESSING',
          "clientMessageId" = COALESCE(mq."clientMessageId", ${clientMessageId}),
          "processingAt" = ${now},
          "lockedBy" = ${input.workerId},
          "lockExpiresAt" = ${input.lockExpiresAt},
          "attemptCount" = mq."attemptCount" + 1,
          "updatedAt" = ${now}
      FROM candidate
      WHERE mq.id = candidate.id
      RETURNING mq.*
    `))) as MessageQueue[];
    return rows[0] ? mapQueue(rows[0]) : null;
  }

  private async claimPortable(input: {
    sessionId: string;
    workerId: string;
    lockExpiresAt: Date;
  }): Promise<QueueItemRecord | null> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const now = new Date();
      const candidate = await this.prisma.messageQueue.findFirst({
        where: {
          assignedSessionId: input.sessionId,
          status: "PENDING",
          availableAt: { lte: now },
          campaign: { status: { in: ["RUNNING", "ACTIVE"] } },
          assignedSession: { is: { status: "CONNECTED", deletedAt: null } },
          OR: [{ lockExpiresAt: null }, { lockExpiresAt: { lt: now } }],

        },
        orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
      });
      if (!candidate) return null;

      const claimed = await this.prisma.messageQueue.updateMany({
        where: {
          id: candidate.id,
          status: "PENDING",
          assignedSession: { is: { status: "CONNECTED", deletedAt: null } },
          OR: [{ lockExpiresAt: null }, { lockExpiresAt: { lt: now } }],
        },
        data: {
          status: "PROCESSING",
          clientMessageId: candidate.clientMessageId ?? crypto.randomUUID().replaceAll("-", "").toUpperCase(),
          processingAt: now,
          lockedBy: input.workerId,
          lockExpiresAt: input.lockExpiresAt,
          attemptCount: { increment: 1 },
        },
      });
      if (claimed.count === 1) {
        return mapQueue(await this.prisma.messageQueue.findUniqueOrThrow({ where: { id: candidate.id } }));
      }
    }
    return null;
  }

  async setRecipientJid(id: string, jid: string): Promise<void> {
    await this.prisma.messageQueue.update({ where: { id }, data: { recipientJid: jid } });
  }

  async releaseForReconciliation(id: string, retryAt: Date): Promise<void> {
    await this.prisma.messageQueue.updateMany({
      where: { id, status: "PROCESSING" },
      data: {
        status: "PENDING",
        processingAt: null,
        lockedBy: null,
        lockExpiresAt: null,
        availableAt: retryAt,
        attemptCount: { decrement: 1 },
      },
    });
  }

  async markSent(id: string, messageId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const item = await tx.messageQueue.findUnique({ where: { id } });
      if (!item || ["CANCELLED", "DEAD_LETTER"].includes(item.status)) return;
      const result = await tx.messageQueue.updateMany({
        where: { id, status: { notIn: ["SENT", "CANCELLED", "DEAD_LETTER"] } },
        data: {
          status: "SENT",
          sentAt: new Date(),
          sentMessageId: messageId,
          lockedBy: null,
          lockExpiresAt: null,
          lastErrorCode: null,
          lastErrorMessage: null,
        },
      });
      if (result.count === 1) {
        await tx.outboxEvent.create({
          data: {
            tenantId: item.tenantId,
            aggregateType: "MessageQueue",
            aggregateId: item.id,
            eventType: "MESSAGE_SENT",
            payload: encodeJson({
              queueItemId: item.id,
              campaignId: item.campaignId,
              tenantId: item.tenantId,
              sessionId: item.assignedSessionId,
              whatsappMessageId: messageId,
            }),
          },
        });
      }
    });
  }

  async markRetryOrDeadLetter(input: {
    id: string;
    errorCode: string;
    errorMessage: string;
    retryAt: Date;
    forceDeadLetter?: boolean;
  }): Promise<"PENDING" | "DEAD_LETTER"> {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.messageQueue.findUniqueOrThrow({ where: { id: input.id } });
      if (["SENT", "CANCELLED", "DEAD_LETTER"].includes(row.status)) {
        return row.status === "DEAD_LETTER" ? "DEAD_LETTER" : "PENDING";
      }
      const dead = input.forceDeadLetter === true || row.attemptCount >= row.maxAttempts;
      if (dead) {
        await tx.messageQueue.update({
          where: { id: input.id },
          data: {
            status: "DEAD_LETTER",
            failedAt: new Date(),
            lockedBy: null,
            lockExpiresAt: null,
            lastErrorCode: input.errorCode,
            lastErrorMessage: input.errorMessage.slice(0, 2000),
          },
        });
        await tx.deadLetterMessage.upsert({
          where: { queueItemId: row.id },
          create: {
            tenantId: row.tenantId,
            queueItemId: row.id,
            campaignId: row.campaignId,
            sessionId: row.assignedSessionId,
            recipientE164: row.recipientE164,
            reasonCode: input.errorCode,
            reasonMessage: input.errorMessage.slice(0, 4000),
            payload: row.payload,
            attemptCount: row.attemptCount,
          },
          update: {
            sessionId: row.assignedSessionId,
            reasonCode: input.errorCode,
            reasonMessage: input.errorMessage.slice(0, 4000),
            attemptCount: row.attemptCount,
            failedAt: new Date(),
            resolvedAt: null,
            resolution: null,
          },
        });
        await tx.outboxEvent.create({
          data: {
            tenantId: row.tenantId,
            aggregateType: "MessageQueue",
            aggregateId: row.id,
            eventType: "MESSAGE_DEAD_LETTERED",
            payload: encodeJson({ queueItemId: row.id, campaignId: row.campaignId, errorCode: input.errorCode }),
          },
        });
        return "DEAD_LETTER";
      }

      await tx.messageQueue.update({
        where: { id: input.id },
        data: {
          status: "PENDING",
          availableAt: input.retryAt,
          processingAt: null,
          lockedBy: null,
          lockExpiresAt: null,
          lastErrorCode: input.errorCode,
          lastErrorMessage: input.errorMessage.slice(0, 2000),
        },
      });
      return "PENDING";
    });
  }


  async pauseCampaignsForSession(input: {
    sessionId: string;
    errorCode: string;
    errorMessage: string;
    retryAt: Date;
  }): Promise<string[]> {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.messageQueue.findMany({
        where: {
          assignedSessionId: input.sessionId,
          status: { in: ["PENDING", "PROCESSING"] },
          campaign: { status: { in: ["RUNNING", "PREPARING"] } },
        },
        select: { campaignId: true },
        distinct: ["campaignId"],
      });
      const campaignIds = rows.map((row) => row.campaignId);
      if (campaignIds.length === 0) return [];

      await tx.campaign.updateMany({
        where: { id: { in: campaignIds }, status: { in: ["RUNNING", "PREPARING"] } },
        data: { status: "PAUSED_BY_CIRCUIT_BREAKER", pausedAt: new Date() },
      });

      const processing = await tx.messageQueue.findMany({
        where: { assignedSessionId: input.sessionId, status: "PROCESSING", campaignId: { in: campaignIds } },
        select: { id: true, attemptCount: true },
      });
      for (const item of processing) {
        await tx.messageQueue.update({
          where: { id: item.id },
          data: {
            status: "PENDING",
            processingAt: null,
            lockedBy: null,
            lockExpiresAt: null,
            availableAt: input.retryAt,
            attemptCount: Math.max(0, item.attemptCount - 1),
            lastErrorCode: input.errorCode,
            lastErrorMessage: input.errorMessage.slice(0, 2000),
          },
        });
      }

      await tx.messageQueue.updateMany({
        where: {
          assignedSessionId: input.sessionId,
          status: "PENDING",
          campaignId: { in: campaignIds },
        },
        data: {
          availableAt: input.retryAt,
          lastErrorCode: input.errorCode,
          lastErrorMessage: input.errorMessage.slice(0, 2000),
        },
      });

      for (const campaignId of campaignIds) {
        const campaign = await tx.campaign.findUnique({ where: { id: campaignId }, select: { tenantId: true } });
        if (!campaign) continue;
        await tx.outboxEvent.create({
          data: {
            tenantId: campaign.tenantId,
            aggregateType: "Campaign",
            aggregateId: campaignId,
            eventType: "CAMPAIGN_CIRCUIT_BREAKER_OPENED",
            payload: encodeJson({
              campaignId,
              sessionId: input.sessionId,
              errorCode: input.errorCode,
              errorMessage: input.errorMessage.slice(0, 1000),
            }),
          },
        });
      }
      return campaignIds;
    });
  }

  async autoFailoverTechnical(input: {
    sessionId: string;
    errorCode: string;
    errorMessage: string;
    availableAt: Date;
    maxTargets: number;
  }): Promise<AutomaticFailoverResult> {
    return this.prisma.$transaction(async (tx) => {
      const items = await tx.messageQueue.findMany({
        where: {
          assignedSessionId: input.sessionId,
          status: { in: ["PENDING", "PROCESSING"] },
          campaign: { status: { in: ["RUNNING", "PREPARING"] } },
        },
        orderBy: [{ campaignId: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          tenantId: true,
          campaignId: true,
        },
      });

      const grouped = new Map<string, typeof items>();
      for (const item of items) {
        const current = grouped.get(item.campaignId) ?? [];
        current.push(item);
        grouped.set(item.campaignId, current);
      }

      const campaigns: AutomaticFailoverResult["campaigns"] = [];
      let totalMoved = 0;
      const now = new Date();

      for (const [campaignId, campaignItems] of grouped) {
        const links = await tx.campaignSession.findMany({
          where: {
            campaignId,
            isEnabled: true,
            sessionId: { not: input.sessionId },
            session: {
              deletedAt: null,
              status: "CONNECTED",
              leaseExpiresAt: { gt: now },
            },
          },
          orderBy: { priority: "asc" },
          take: Math.max(1, input.maxTargets),
          select: { sessionId: true },
        });

        const targetSessionIds = links.map((link) => link.sessionId);
        if (targetSessionIds.length === 0) {
          await tx.messageQueue.updateMany({
            where: { id: { in: campaignItems.map((item) => item.id) } },
            data: {
              status: "PENDING",
              processingAt: null,
              lockedBy: null,
              lockExpiresAt: null,
              availableAt: input.availableAt,
              lastErrorCode: "AUTO_FAILOVER_NO_REPLACEMENT",
              lastErrorMessage: `${input.errorCode}: ${input.errorMessage}`.slice(0, 2000),
            },
          });
          await tx.campaign.updateMany({
            where: { id: campaignId, status: { in: ["RUNNING", "PREPARING"] } },
            data: { status: "PAUSED_BY_CIRCUIT_BREAKER", pausedAt: now },
          });
          campaigns.push({
            campaignId,
            movedMessages: 0,
            targetSessionIds: [],
            pausedBecauseNoReplacement: true,
          });
        } else {
          const assignments = distributeRoundRobin(campaignItems, targetSessionIds);
          for (const assignment of assignments) {
            await tx.messageQueue.updateMany({
              where: { id: { in: assignment.items.map((item) => item.id) } },
              data: {
                assignedSessionId: assignment.targetSessionId,
                status: "PENDING",
                processingAt: null,
                lockedBy: null,
                lockExpiresAt: null,
                availableAt: input.availableAt,
                lastErrorCode: "AUTO_FAILOVER_TECHNICAL",
                lastErrorMessage: `Transferido automáticamente desde ${input.sessionId}. ${input.errorCode}: ${input.errorMessage}`.slice(0, 2000),
              },
            });
          }

          totalMoved += campaignItems.length;
          campaigns.push({
            campaignId,
            movedMessages: campaignItems.length,
            targetSessionIds,
            pausedBecauseNoReplacement: false,
          });
        }

        const tenantId = campaignItems[0]?.tenantId;
        if (tenantId) {
          const result = campaigns[campaigns.length - 1];
          await tx.outboxEvent.create({
            data: {
              tenantId,
              aggregateType: "Campaign",
              aggregateId: campaignId,
              eventType: result?.pausedBecauseNoReplacement
                ? "CAMPAIGN_AUTO_FAILOVER_UNAVAILABLE"
                : "CAMPAIGN_AUTO_FAILOVER_COMPLETED",
              payload: encodeJson({
                campaignId,
                sourceSessionId: input.sessionId,
                targetSessionIds: result?.targetSessionIds ?? [],
                movedMessages: result?.movedMessages ?? 0,
                errorCode: input.errorCode,
                errorMessage: input.errorMessage.slice(0, 1000),
              }),
            },
          });
        }
      }

      return {
        sourceSessionId: input.sessionId,
        totalMoved,
        campaigns,
      };
    });
  }

  async quarantineSessionQueue(input: {
    sessionId: string;
    errorCode: string;
    errorMessage: string;
    availableAt: Date;
  }): Promise<SessionQuarantineResult> {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.messageQueue.findMany({
        where: {
          assignedSessionId: input.sessionId,
          status: { in: ["PENDING", "PROCESSING"] },
          campaign: { status: { in: ["RUNNING", "PREPARING"] } },
        },
        select: { id: true, tenantId: true, campaignId: true },
      });
      const campaignIds = [...new Set(rows.map((row) => row.campaignId))];
      if (rows.length === 0) {
        return {
          sourceSessionId: input.sessionId,
          campaignIds: [],
          pausedCampaignIds: [],
          heldMessages: 0,
        };
      }

      await tx.messageQueue.updateMany({
        where: { id: { in: rows.map((row) => row.id) } },
        data: {
          status: "PENDING",
          processingAt: null,
          lockedBy: null,
          lockExpiresAt: null,
          availableAt: input.availableAt,
          lastErrorCode: "HELD_SESSION_QUARANTINED",
          lastErrorMessage: `${input.errorCode}: ${input.errorMessage}`.slice(0, 2000),
        },
      });

      const pausedCampaignIds: string[] = [];
      const now = new Date();
      for (const campaignId of campaignIds) {
        const runnableOnOtherSessions = await tx.messageQueue.count({
          where: {
            campaignId,
            assignedSessionId: { not: input.sessionId },
            status: { in: ["PENDING", "PROCESSING"] },
            assignedSession: {
              is: {
                deletedAt: null,
                status: "CONNECTED",
                leaseExpiresAt: { gt: now },
              },
            },
          },
        });

        if (runnableOnOtherSessions === 0) {
          const paused = await tx.campaign.updateMany({
            where: { id: campaignId, status: { in: ["RUNNING", "PREPARING"] } },
            data: { status: "PAUSED_BY_CIRCUIT_BREAKER", pausedAt: now },
          });
          if (paused.count === 1) pausedCampaignIds.push(campaignId);
        }

        const tenantId = rows.find((row) => row.campaignId === campaignId)?.tenantId;
        if (tenantId) {
          await tx.outboxEvent.create({
            data: {
              tenantId,
              aggregateType: "Campaign",
              aggregateId: campaignId,
              eventType: "CAMPAIGN_SESSION_QUARANTINED",
              payload: encodeJson({
                campaignId,
                sessionId: input.sessionId,
                errorCode: input.errorCode,
                errorMessage: input.errorMessage.slice(0, 1000),
                campaignPaused: pausedCampaignIds.includes(campaignId),
              }),
            },
          });
        }
      }

      return {
        sourceSessionId: input.sessionId,
        campaignIds,
        pausedCampaignIds,
        heldMessages: rows.length,
      };
    });
  }

  async listAffectedCampaignIds(sessionId: string): Promise<string[]> {
    const rows = await this.prisma.messageQueue.findMany({
      where: { assignedSessionId: sessionId, status: { in: ["PENDING", "PROCESSING"] } },
      select: { campaignId: true },
      distinct: ["campaignId"],
    });
    return rows.map((row) => row.campaignId);
  }

  async reassignForFailover(input: {
    campaignId: string;
    failedSessionId: string;
    replacementSessionId: string;
  }): Promise<number> {
    const result = await this.prisma.messageQueue.updateMany({
      where: {
        campaignId: input.campaignId,
        assignedSessionId: input.failedSessionId,
        status: { in: ["PENDING", "PROCESSING"] },
      },
      data: {
        assignedSessionId: input.replacementSessionId,
        status: "PENDING",
        processingAt: null,
        lockedBy: null,
        lockExpiresAt: null,
        availableAt: new Date(Date.now() + 3000),
      },
    });
    return result.count;
  }

  async releaseWithoutReplacement(sessionId: string, retryAt: Date): Promise<number> {
    const result = await this.prisma.messageQueue.updateMany({
      where: { assignedSessionId: sessionId, status: "PROCESSING" },
      data: {
        status: "PENDING",
        processingAt: null,
        lockedBy: null,
        lockExpiresAt: null,
        availableAt: retryAt,
      },
    });
    return result.count;
  }

  async findExistingRecipients(tenantId: string, recipientsE164: string[]): Promise<Set<string>> {
    const unique = [...new Set(recipientsE164)];
    if (unique.length === 0) return new Set();

    const found = new Set<string>();
    const CHUNK_SIZE = 1000; // límite prudente para cláusulas IN de SQL Server
    for (let i = 0; i < unique.length; i += CHUNK_SIZE) {
      const chunk = unique.slice(i, i + CHUNK_SIZE);
      const rows = await this.prisma.messageQueue.findMany({
        where: { tenantId, recipientE164: { in: chunk } },
        select: { recipientE164: true },
        distinct: ["recipientE164"],
      });
      for (const row of rows) {
        if (row.recipientE164) found.add(row.recipientE164);
      }
    }
    return found;
  }
}
