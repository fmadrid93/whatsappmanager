import type { MediaPreparationJob, PrismaClient } from "@prisma/client";
import type {
  IMediaPreparationRepository,
  MediaPreparationJobRecord,
} from "../../application/ports/repositories/media-preparation.repository.js";

function mapJob(row: MediaPreparationJob): MediaPreparationJobRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    campaignId: row.campaignId,
    mediaAssetId: row.mediaAssetId,
    sessionId: row.sessionId,
    status: row.status,
    attemptCount: row.attemptCount,
    maxAttempts: row.maxAttempts,
  };
}

export class PrismaMediaPreparationRepository implements IMediaPreparationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async ensureCampaignJobs(input: {
    tenantId: string;
    campaignId: string;
    mediaAssetId: string;
    sessionIds: string[];
  }): Promise<void> {
    if (input.sessionIds.length === 0) return;
    await this.prisma.$transaction(
      input.sessionIds.map((sessionId) =>
        this.prisma.mediaPreparationJob.upsert({
          where: { campaignId_sessionId: { campaignId: input.campaignId, sessionId } },
          create: {
            tenantId: input.tenantId,
            campaignId: input.campaignId,
            mediaAssetId: input.mediaAssetId,
            sessionId,
          },
          update: {},
        }),
      ),
    );
  }

  async claimNextForSession(input: {
    sessionId: string;
    workerId: string;
    lockExpiresAt: Date;
  }): Promise<MediaPreparationJobRecord | null> {
    const now = new Date();

    await this.prisma.mediaPreparationJob.updateMany({
      where: {
        sessionId: input.sessionId,
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

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = await this.prisma.mediaPreparationJob.findFirst({
        where: {
          sessionId: input.sessionId,
          status: "PENDING",
          availableAt: { lte: now },
          campaign: { status: "PREPARING" },
        },
        orderBy: [{ createdAt: "asc" }],
      });
      if (!candidate) return null;

      const claimed = await this.prisma.mediaPreparationJob.updateMany({
        where: { id: candidate.id, status: "PENDING" },
        data: {
          status: "PROCESSING",
          processingAt: now,
          lockedBy: input.workerId,
          lockExpiresAt: input.lockExpiresAt,
          attemptCount: { increment: 1 },
        },
      });
      if (claimed.count === 1) {
        return mapJob(
          await this.prisma.mediaPreparationJob.findUniqueOrThrow({ where: { id: candidate.id } }),
        );
      }
    }
    return null;
  }

  async markPrepared(id: string): Promise<void> {
    await this.prisma.mediaPreparationJob.update({
      where: { id },
      data: {
        status: "PREPARED",
        preparedAt: new Date(),
        lockedBy: null,
        lockExpiresAt: null,
        lastError: null,
      },
    });
  }

  async markRetryOrFailed(input: {
    id: string;
    errorMessage: string;
    retryAt: Date;
  }): Promise<"PENDING" | "FAILED"> {
    const row = await this.prisma.mediaPreparationJob.findUniqueOrThrow({ where: { id: input.id } });
    const failed = row.attemptCount >= row.maxAttempts;
    await this.prisma.mediaPreparationJob.update({
      where: { id: input.id },
      data: failed
        ? {
            status: "FAILED",
            failedAt: new Date(),
            lockedBy: null,
            lockExpiresAt: null,
            lastError: input.errorMessage.slice(0, 4000),
          }
        : {
            status: "PENDING",
            availableAt: input.retryAt,
            processingAt: null,
            lockedBy: null,
            lockExpiresAt: null,
            lastError: input.errorMessage.slice(0, 4000),
          },
    });
    return failed ? "FAILED" : "PENDING";
  }

  async areAllPrepared(campaignId: string): Promise<boolean> {
    const [total, remaining] = await Promise.all([
      this.prisma.mediaPreparationJob.count({ where: { campaignId } }),
      this.prisma.mediaPreparationJob.count({
        where: { campaignId, status: { not: "PREPARED" } },
      }),
    ]);
    return total > 0 && remaining === 0;
  }
}
