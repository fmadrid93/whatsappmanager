import type { PrismaClient } from "@prisma/client";
import type {
  CreateRefreshSessionInput,
  IRefreshSessionRepository,
  RefreshSessionRecord,
} from "../../application/ports/repositories/refresh-session.repository.js";

export class PrismaRefreshSessionRepository implements IRefreshSessionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  create(input: CreateRefreshSessionInput): Promise<RefreshSessionRecord> {
    return this.prisma.refreshSession.create({ data: input });
  }

  findByTokenHash(tokenHash: string): Promise<RefreshSessionRecord | null> {
    return this.prisma.refreshSession.findUnique({ where: { tokenHash } });
  }

  async rotate(currentId: string, replacement: CreateRefreshSessionInput): Promise<RefreshSessionRecord> {
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.refreshSession.create({ data: replacement });
      const updated = await tx.refreshSession.updateMany({
        where: { id: currentId, revokedAt: null },
        data: { revokedAt: new Date(), replacedById: created.id },
      });
      if (updated.count !== 1) {
        throw new Error("La sesión de actualización ya fue utilizada.");
      }
      return created;
    });
  }

  async revokeByTokenHash(tokenHash: string): Promise<void> {
    await this.prisma.refreshSession.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshSession.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
