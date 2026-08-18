import type { PrismaClient } from "@prisma/client";
import type { IBaileysAuthRepository } from "../../application/ports/repositories/baileys-auth.repository.js";
import type { ICryptoBox } from "../../application/ports/crypto/crypto-box.js";
import { toPrismaBytes } from "../../shared/utils/json-buffer.js";

export class PrismaBaileysAuthRepository implements IBaileysAuthRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly crypto: ICryptoBox,
  ) {}

  async getCredentials(sessionId: string): Promise<Buffer | null> {
    const row = await this.prisma.baileysCredential.findUnique({ where: { sessionId } });
    return row ? this.crypto.decrypt(Buffer.from(row.payload)) : null;
  }

  async saveCredentials(sessionId: string, payload: Buffer): Promise<void> {
    const encrypted = toPrismaBytes(this.crypto.encrypt(payload));
    await this.prisma.baileysCredential.upsert({
      where: { sessionId },
      create: { sessionId, payload: encrypted },
      update: { payload: encrypted, revision: { increment: 1 } },
    });
  }

  async getKeys(sessionId: string, category: string, ids: string[]): Promise<Record<string, Buffer>> {
    if (ids.length === 0) return {};
    const rows = await this.prisma.baileysAuthKey.findMany({
      where: { sessionId, category, keyId: { in: ids } },
    });
    return Object.fromEntries(
      rows.map((row) => [row.keyId, this.crypto.decrypt(Buffer.from(row.payload))]),
    );
  }

  async setKey(sessionId: string, category: string, id: string, payload: Buffer | null): Promise<void> {
    if (!payload) {
      await this.prisma.baileysAuthKey.deleteMany({ where: { sessionId, category, keyId: id } });
      return;
    }
    const encrypted = toPrismaBytes(this.crypto.encrypt(payload));
    await this.prisma.baileysAuthKey.upsert({
      where: { sessionId_category_keyId: { sessionId, category, keyId: id } },
      create: { sessionId, category, keyId: id, payload: encrypted },
      update: { payload: encrypted },
    });
  }

  async clearSession(sessionId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.baileysAuthKey.deleteMany({ where: { sessionId } }),
      this.prisma.baileysCredential.deleteMany({ where: { sessionId } }),
    ]);
  }
}
