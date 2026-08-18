import type { PrismaClient } from "@prisma/client";
import type { IDatabaseProbe } from "../../application/ports/system/database-probe.js";

export class PrismaDatabaseProbe implements IDatabaseProbe {
  constructor(private readonly prisma: PrismaClient) {}

  async ping(): Promise<void> {
    await this.prisma.$queryRaw`SELECT 1`;
  }
}
