import { Prisma, type OutboxEvent, type PrismaClient } from "@prisma/client";
import type { IOutboxRepository, OutboxRecord } from "../../application/ports/repositories/outbox.repository.js";

function map(row: OutboxEvent): OutboxRecord {
  return {
    id: row.id,
    tenantId: row.tenantId ?? undefined,
    aggregateType: row.aggregateType,
    aggregateId: row.aggregateId,
    eventType: row.eventType,
    payload: Buffer.from(row.payload),
    status: row.status,
    attemptCount: row.attemptCount,
    maxAttempts: row.maxAttempts,
    createdAt: row.createdAt,
  };
}

export class PrismaOutboxRepository implements IOutboxRepository {
  private readonly postgres: boolean;

  constructor(private readonly prisma: PrismaClient, databaseUrl: string) {
    this.postgres = databaseUrl.startsWith("postgresql://") || databaseUrl.startsWith("postgres://");
  }

  async claimBatch(input: { workerId: string; limit: number; lockExpiresAt: Date }): Promise<OutboxRecord[]> {
    const now = new Date();
    await this.prisma.outboxEvent.updateMany({
      where: { status: "PROCESSING", lockExpiresAt: { lt: now } },
      data: { status: "PENDING", lockedBy: null, lockExpiresAt: null, availableAt: now },
    });

    if (this.postgres) {
      const rows = await this.prisma.$transaction(async (tx) => tx.$queryRaw<OutboxEvent[]>(Prisma.sql`
        WITH candidates AS (
          SELECT id
          FROM "OutboxEvent"
          WHERE status = 'PENDING'
            AND "availableAt" <= ${now}
            AND "attemptCount" < "maxAttempts"
            AND ("lockExpiresAt" IS NULL OR "lockExpiresAt" < ${now})
          ORDER BY "createdAt" ASC
          FOR UPDATE SKIP LOCKED
          LIMIT ${input.limit}
        )
        UPDATE "OutboxEvent" event
        SET status = 'PROCESSING',
            "lockedBy" = ${input.workerId},
            "lockExpiresAt" = ${input.lockExpiresAt},
            "attemptCount" = event."attemptCount" + 1,
            "updatedAt" = ${now}
        FROM candidates
        WHERE event.id = candidates.id
        RETURNING event.*
      `));
      return rows.map(map);
    }

    const candidates = await this.prisma.outboxEvent.findMany({
      where: {
        status: "PENDING",
        availableAt: { lte: now },
        OR: [{ lockExpiresAt: null }, { lockExpiresAt: { lt: now } }],
      },
      orderBy: { createdAt: "asc" },
      take: input.limit,
    });
    const claimed: OutboxRecord[] = [];
    for (const candidate of candidates) {
      if (candidate.attemptCount >= candidate.maxAttempts) continue;
      const result = await this.prisma.outboxEvent.updateMany({
        where: { id: candidate.id, status: "PENDING" },
        data: {
          status: "PROCESSING",
          lockedBy: input.workerId,
          lockExpiresAt: input.lockExpiresAt,
          attemptCount: { increment: 1 },
        },
      });
      if (result.count === 1) claimed.push(map(await this.prisma.outboxEvent.findUniqueOrThrow({ where: { id: candidate.id } })));
    }
    return claimed;
  }

  async markPublished(ids: string[]): Promise<void> {
    if (!ids.length) return;
    await this.prisma.outboxEvent.updateMany({
      where: { id: { in: ids }, status: "PROCESSING" },
      data: { status: "PUBLISHED", publishedAt: new Date(), lockedBy: null, lockExpiresAt: null, lastError: null },
    });
  }

  async markFailed(input: { ids: string[]; errorMessage: string; retryAt: Date }): Promise<void> {
    if (!input.ids.length) return;
    const rows = await this.prisma.outboxEvent.findMany({ where: { id: { in: input.ids } } });
    await this.prisma.$transaction(rows.map((row) => this.prisma.outboxEvent.update({
      where: { id: row.id },
      data: {
        status: row.attemptCount >= row.maxAttempts ? "FAILED" : "PENDING",
        availableAt: input.retryAt,
        lockedBy: null,
        lockExpiresAt: null,
        lastError: input.errorMessage.slice(0, 4000),
      },
    })));
  }

  countPending(): Promise<number> {
    return this.prisma.outboxEvent.count({ where: { status: { in: ["PENDING", "PROCESSING"] } } });
  }
}
