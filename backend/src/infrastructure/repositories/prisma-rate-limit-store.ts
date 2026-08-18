import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import type {
  IRateLimitStore,
  RateLimitConsumeInput,
  RateLimitConsumeResult,
} from "../../application/ports/security/rate-limit-store.js";

export class PrismaRateLimitStore implements IRateLimitStore {
  private consumeCounter = 0;

  constructor(private readonly prisma: PrismaClient) {}

  async consume(input: RateLimitConsumeInput): Promise<RateLimitConsumeResult> {
    const key = createHash("sha256").update(input.key).digest("hex");
    const resetAt = new Date(input.now.getTime() + input.windowMs);

    this.consumeCounter += 1;
    if (this.consumeCounter % 1000 === 0) {
      void this.prisma.rateLimitBucket.deleteMany({
        where: { resetAt: { lt: new Date(input.now.getTime() - 86_400_000) } },
      });
    }

    for (let retry = 0; retry < 3; retry += 1) {
      try {
        return await this.prisma.$transaction(async (transaction) => {
          const current = await transaction.rateLimitBucket.findUnique({ where: { key } });

          if (!current || current.resetAt <= input.now) {
            const row = await transaction.rateLimitBucket.upsert({
              where: { key },
              create: { key, count: 1, resetAt },
              update: { count: 1, resetAt },
            });
            return { count: row.count, resetAt: row.resetAt };
          }

          const row = await transaction.rateLimitBucket.update({
            where: { key },
            data: { count: { increment: 1 } },
          });
          return { count: row.count, resetAt: row.resetAt };
        }, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034" && retry < 2) {
          continue;
        }
        throw error;
      }
    }

    throw new Error("No se pudo registrar el límite distribuido.");
  }
}
