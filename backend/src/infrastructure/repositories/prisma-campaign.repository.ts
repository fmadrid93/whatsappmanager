import crypto from "node:crypto";
import type { Campaign, PrismaClient } from "@prisma/client";
import type {
  AddCampaignSessionsResult,
  CampaignRecord,
  CreateCampaignInput,
  ICampaignRepository,
} from "../../application/ports/repositories/campaign.repository.js";
import { encodeJson } from "../../shared/utils/json-buffer.js";
import { renderCampaignTemplate } from "../../domain/campaign/campaign-message.js";
import { HttpError } from "../../shared/errors/http-error.js";

function mapCampaign(row: Campaign, sessionIds?: string[]): CampaignRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    status: row.status,
    mediaAssetId: row.mediaAssetId ?? undefined,
    messagePayload: Buffer.from(row.messagePayload),
    totalMessages: row.totalMessages,
    sentMessages: row.sentMessages,
    failedMessages: row.failedMessages,
    createdAt: row.createdAt,
    startedAt: row.startedAt ?? undefined,
    pausedAt: row.pausedAt ?? undefined,
    completedAt: row.completedAt ?? undefined,
    cancelledAt: row.cancelledAt ?? undefined,
    sessionIds,
  };
}

export class PrismaCampaignRepository implements ICampaignRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createWithQueue(input: CreateCampaignInput): Promise<CampaignRecord> {
    return this.prisma.$transaction(async (tx) => {
      const sessions = await tx.whatsAppSession.findMany({
        where: {
          id: { in: input.sessionIds },
          tenantId: input.tenantId,
          ownerUserId: input.ownerUserId,
        },
      });
      if (sessions.length !== new Set(input.sessionIds).size) {
        throw new Error("Una o más sesiones no pertenecen al usuario autenticado.");
      }

      if (input.mediaAssetId) {
        const media = await tx.mediaAsset.findFirst({ where: { id: input.mediaAssetId, tenantId: input.tenantId } });
        if (!media) throw new Error("Archivo multimedia no encontrado.");
      }

      const campaign = await tx.campaign.create({
        data: {
          id: input.id,
          tenantId: input.tenantId,
          name: input.name,
          mediaAssetId: input.mediaAssetId,
          messagePayload: encodeJson(input.message),
          totalMessages: input.contacts.length,
        },
      });

      await tx.campaignSession.createMany({
        data: input.sessionIds.map((sessionId, index) => ({ campaignId: campaign.id, sessionId, priority: index + 1 })),
      });

      const queueRows = input.contacts.map((contact, index) => ({
        tenantId: input.tenantId,
        campaignId: campaign.id,
        assignedSessionId: input.sessionIds[index % input.sessionIds.length],
        mediaAssetId: input.mediaAssetId,
        contactName: contact.name,
        recipientRaw: contact.raw,
        recipientE164: contact.e164,
        messageType: input.mediaAssetId ? "MEDIA" : "TEXT",
        payload: encodeJson(renderCampaignTemplate(input.message, contact.variables)),
        status: "PENDING",
        priority: 100,
        idempotencyKey: crypto.createHash("sha256").update(`${campaign.id}:${index}:${contact.e164}`).digest("hex"),
      }));
      if (queueRows.length > 0) await tx.messageQueue.createMany({ data: queueRows });
      await tx.outboxEvent.create({
        data: {
          tenantId: input.tenantId,
          aggregateType: "Campaign",
          aggregateId: campaign.id,
          eventType: "CAMPAIGN_CREATED",
          payload: encodeJson({ campaignId: campaign.id, tenantId: input.tenantId, totalMessages: input.contacts.length }),
        },
      });
      return mapCampaign(campaign, input.sessionIds);
    });
  }

  async listByTenant(tenantId: string): Promise<CampaignRecord[]> {
    const rows = await this.prisma.campaign.findMany({
      where: { tenantId },
      include: { sessionLinks: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return rows.map((row) => mapCampaign(row, row.sessionLinks.map((link) => link.sessionId)));
  }

  async findByIdForTenant(id: string, tenantId: string): Promise<CampaignRecord | null> {
    const row = await this.prisma.campaign.findFirst({ where: { id, tenantId }, include: { sessionLinks: true } });
    return row ? mapCampaign(row, row.sessionLinks.map((link) => link.sessionId)) : null;
  }

  async setPreparing(id: string, tenantId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const result = await tx.campaign.updateMany({
        where: { id, tenantId, status: { in: ["DRAFT", "PAUSED", "PAUSED_BY_CIRCUIT_BREAKER"] } },
        data: { status: "PREPARING", startedAt: new Date(), pausedAt: null, cancelledAt: null },
      });
      if (result.count !== 1) throw new HttpError(409, "La campaña no está disponible para iniciar o reanudar.");
      await tx.messageQueue.updateMany({
        where: {
          campaignId: id,
          status: "PENDING",
          OR: [
            { lastErrorCode: null },
            { lastErrorCode: { not: "HELD_SESSION_QUARANTINED" } },
          ],
        },
        data: { availableAt: new Date(), lastErrorCode: null, lastErrorMessage: null },
      });
      await tx.outboxEvent.create({ data: {
        tenantId, aggregateType: "Campaign", aggregateId: id, eventType: "CAMPAIGN_START_REQUESTED",
        payload: encodeJson({ campaignId: id, tenantId }),
      } });
    });
  }

  async pause(id: string, tenantId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const result = await tx.campaign.updateMany({
        where: { id, tenantId, status: { in: ["RUNNING", "PREPARING"] } },
        data: { status: "PAUSED", pausedAt: new Date() },
      });
      if (result.count !== 1) throw new HttpError(409, "Solo se puede pausar una campaña en ejecución o preparación.");
      await tx.outboxEvent.create({ data: {
        tenantId, aggregateType: "Campaign", aggregateId: id, eventType: "CAMPAIGN_PAUSED",
        payload: encodeJson({ campaignId: id, tenantId }),
      } });
    });
  }

  async cancel(id: string, tenantId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const result = await tx.campaign.updateMany({
        where: { id, tenantId, status: { notIn: ["COMPLETED", "COMPLETED_WITH_ERRORS", "CANCELLED"] } },
        data: { status: "CANCELLED", cancelledAt: new Date() },
      });
      if (result.count !== 1) throw new HttpError(409, "La campaña ya terminó o fue cancelada.");
      await tx.messageQueue.updateMany({
        where: { campaignId: id, status: { in: ["PENDING", "PROCESSING"] } },
        data: { status: "CANCELLED", lockedBy: null, lockExpiresAt: null, processingAt: null },
      });
      await tx.mediaPreparationJob.updateMany({
        where: { campaignId: id, status: { in: ["PENDING", "PROCESSING"] } },
        data: { status: "CANCELLED", lockedBy: null, lockExpiresAt: null },
      });
      await tx.outboxEvent.create({ data: {
        tenantId, aggregateType: "Campaign", aggregateId: id, eventType: "CAMPAIGN_CANCELLED",
        payload: encodeJson({ campaignId: id, tenantId }),
      } });
    });
  }

  async setRunning(id: string): Promise<boolean> {
    const result = await this.prisma.campaign.updateMany({ where: { id, status: "PREPARING" }, data: { status: "RUNNING" } });
    return result.count === 1;
  }

  async setCompleted(id: string): Promise<void> {
    await this.prisma.campaign.updateMany({
      where: { id, status: { notIn: ["CANCELLED", "PAUSED", "PAUSED_BY_CIRCUIT_BREAKER"] } },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
  }

  async listPreparing(limit: number): Promise<CampaignRecord[]> {
    const rows = await this.prisma.campaign.findMany({
      where: { status: "PREPARING" },
      include: { sessionLinks: { where: { isEnabled: true }, orderBy: { priority: "asc" } } },
      orderBy: { updatedAt: "asc" },
      take: limit,
    });
    return rows.map((row) => mapCampaign(row, row.sessionLinks.map((link) => link.sessionId)));
  }

  async getSessionIds(campaignId: string): Promise<string[]> {
    const rows = await this.prisma.campaignSession.findMany({
      where: { campaignId, isEnabled: true },
      orderBy: { priority: "asc" },
    });
    return rows.map((row) => row.sessionId);
  }

  async addSessions(input: {
    campaignId: string;
    tenantId: string;
    ownerUserId: string;
    sessionIds: string[];
  }): Promise<AddCampaignSessionsResult> {
    const requested = [...new Set(input.sessionIds)];
    if (requested.length === 0) {
      throw new HttpError(400, "Selecciona al menos una sesión para recuperar la campaña.");
    }

    return this.prisma.$transaction(async (tx) => {
      const campaign = await tx.campaign.findFirst({
        where: { id: input.campaignId, tenantId: input.tenantId },
        select: { id: true },
      });
      if (!campaign) throw new HttpError(404, "Campaña no encontrada.");

      const sessions = await tx.whatsAppSession.findMany({
        where: {
          id: { in: requested },
          tenantId: input.tenantId,
          ownerUserId: input.ownerUserId,
          deletedAt: null,
          status: "CONNECTED",
        },
        select: { id: true },
      });
      if (sessions.length !== requested.length) {
        throw new HttpError(409, "Una o más sesiones nuevas no están conectadas o no pertenecen al usuario autenticado.");
      }

      const existing = await tx.campaignSession.findMany({
        where: { campaignId: input.campaignId },
        select: { sessionId: true, priority: true, isEnabled: true },
      });
      const existingById = new Map(existing.map((item) => [item.sessionId, item]));
      let nextPriority = existing.reduce((max, item) => Math.max(max, item.priority), 0) + 1;
      const addedSessionIds: string[] = [];

      for (const sessionId of requested) {
        const current = existingById.get(sessionId);
        if (current) {
          if (!current.isEnabled) {
            await tx.campaignSession.update({
              where: { campaignId_sessionId: { campaignId: input.campaignId, sessionId } },
              data: { isEnabled: true },
            });
            addedSessionIds.push(sessionId);
          }
          continue;
        }

        await tx.campaignSession.create({
          data: {
            campaignId: input.campaignId,
            sessionId,
            priority: nextPriority,
            isEnabled: true,
          },
        });
        nextPriority += 1;
        addedSessionIds.push(sessionId);
      }

      const configured = await tx.campaignSession.findMany({
        where: { campaignId: input.campaignId, isEnabled: true },
        orderBy: { priority: "asc" },
        select: { sessionId: true },
      });

      return {
        addedSessionIds,
        configuredSessionIds: configured.map((item) => item.sessionId),
      };
    });
  }

  async incrementSent(campaignId: string): Promise<void> {
    try {
      await this.prisma.campaign.update({
        where: { id: campaignId },
        data: { sentMessages: { increment: 1 } },
      });
    } catch {
      // Ignorar si la campaña ya no existe o fue eliminada
    }
  }

  async incrementFailed(campaignId: string): Promise<void> {
    try {
      await this.prisma.campaign.update({
        where: { id: campaignId },
        data: { failedMessages: { increment: 1 } },
      });
    } catch {
      // Ignorar si la campaña ya no existe o fue eliminada
    }
  }

  async refreshStats(campaignId: string): Promise<void> {
    const now = new Date();
    const [sent, failed, unfinished, runnableUnfinished, campaign] = await Promise.all([
      this.prisma.messageQueue.count({ where: { campaignId, status: "SENT" } }),
      this.prisma.messageQueue.count({ where: { campaignId, status: { in: ["FAILED", "DEAD_LETTER"] } } }),
      this.prisma.messageQueue.count({ where: { campaignId, status: { in: ["PENDING", "PROCESSING"] } } }),
      this.prisma.messageQueue.count({
        where: {
          campaignId,
          status: { in: ["PENDING", "PROCESSING"] },
          assignedSession: {
            is: {
              deletedAt: null,
              status: "CONNECTED",
              leaseExpiresAt: { gt: now },
            },
          },
        },
      }),
      this.prisma.campaign.findUniqueOrThrow({ where: { id: campaignId }, select: { status: true } }),
    ]);
    const terminalStateAllowed = !["CANCELLED", "PAUSED", "PAUSED_BY_CIRCUIT_BREAKER"].includes(campaign.status);
    const canComplete = unfinished === 0 && terminalStateAllowed;
    const shouldPauseForUnavailableSessions = unfinished > 0
      && runnableUnfinished === 0
      && ["RUNNING", "PREPARING"].includes(campaign.status);

    await this.prisma.campaign.update({
      where: { id: campaignId },
      data: {
        sentMessages: sent,
        failedMessages: failed,
        ...(canComplete ? {
          status: failed > 0 ? "COMPLETED_WITH_ERRORS" : "COMPLETED",
          completedAt: now,
        } : {}),
        ...(shouldPauseForUnavailableSessions ? {
          status: "PAUSED_BY_CIRCUIT_BREAKER",
          pausedAt: now,
        } : {}),
      },
    });
  }
}

