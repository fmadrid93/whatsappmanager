import type { PrismaClient } from "@prisma/client";
import type { DeadLetterRecord, IDeadLetterRepository } from "../../application/ports/repositories/dead-letter.repository.js";
import { HttpError } from "../../shared/errors/http-error.js";

export class PrismaDeadLetterRepository implements IDeadLetterRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listByCampaign(tenantId: string, campaignId: string, take: number): Promise<DeadLetterRecord[]> {
    const rows = await this.prisma.deadLetterMessage.findMany({
      where: { tenantId, campaignId },
      orderBy: { failedAt: "desc" },
      take,
    });
    return rows.map((row) => ({
      id: row.id,
      queueItemId: row.queueItemId,
      campaignId: row.campaignId,
      sessionId: row.sessionId ?? undefined,
      recipientE164: row.recipientE164 ?? undefined,
      reasonCode: row.reasonCode,
      reasonMessage: row.reasonMessage,
      attemptCount: row.attemptCount,
      failedAt: row.failedAt,
      resolvedAt: row.resolvedAt ?? undefined,
    }));
  }

  async requeue(tenantId: string, deadLetterId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const dead = await tx.deadLetterMessage.findFirst({ where: { id: deadLetterId, tenantId } });
      if (!dead) throw new HttpError(404, "Registro de Dead Letter no encontrado.");
      if (dead.resolvedAt) throw new HttpError(409, "El registro ya fue resuelto.");

      await tx.messageQueue.update({
        where: { id: dead.queueItemId },
        data: {
          status: "PENDING",
          attemptCount: 0,
          failedAt: null,
          processingAt: null,
          lockedBy: null,
          lockExpiresAt: null,
          availableAt: new Date(),
          lastErrorCode: null,
          lastErrorMessage: null,
        },
      });
      await tx.deadLetterMessage.update({
        where: { id: dead.id },
        data: { resolvedAt: new Date(), resolution: "REQUEUED" },
      });
      await tx.campaign.update({
        where: { id: dead.campaignId },
        data: { status: "RUNNING", completedAt: null, cancelledAt: null, pausedAt: null },
      });
    });
  }
}
