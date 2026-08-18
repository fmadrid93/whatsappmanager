import type { PrismaClient } from "@prisma/client";
import type { ActiveUserSummary, IUserRepository, UserAuthRecord } from "../../application/ports/repositories/user.repository.js";

export class PrismaUserRepository implements IUserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByEmail(email: string): Promise<UserAuthRecord | null> {
    const user = await this.prisma.appUser.findUnique({
      where: { email: email.toLowerCase() },
      include: { tenant: true },
    });
    return user && user.status === "ACTIVE" && user.tenant.status === "ACTIVE" ? user : null;
  }

  async findById(id: string): Promise<UserAuthRecord | null> {
    const user = await this.prisma.appUser.findUnique({
      where: { id },
      include: { tenant: true },
    });
    return user && user.status === "ACTIVE" && user.tenant.status === "ACTIVE" ? user : null;
  }

  async listActiveByTenant(tenantId: string): Promise<ActiveUserSummary[]> {
    return this.prisma.appUser.findMany({
      where: { tenantId, status: "ACTIVE" },
      select: { id: true, email: true, displayName: true, role: true },
      orderBy: [{ displayName: "asc" }, { email: "asc" }],
    });
  }
}
