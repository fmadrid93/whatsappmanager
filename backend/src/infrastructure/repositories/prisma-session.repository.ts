import crypto from "node:crypto";
import type { Prisma, PrismaClient, WhatsAppSession } from "@prisma/client";
import type {
  CreateSessionInput,
  ISessionRepository,
  SessionRecord,
} from "../../application/ports/repositories/session.repository.js";
import { stableShardKey } from "../../domain/scaling/shard.js";
import { encodeJson } from "../../shared/utils/json-buffer.js";

function mapSession(row: WhatsAppSession): SessionRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    ownerUserId: row.ownerUserId,
    name: row.name,
    expectedPhoneE164: row.expectedPhoneE164 ?? undefined,
    phoneE164: row.phoneE164 ?? undefined,
    whatsappJid: row.whatsappJid ?? undefined,
    pairingMethod: row.pairingMethod === "CODE" ? "CODE" : "QR",
    pairingCode: row.pairingCode ?? undefined,
    pairingCodeUpdatedAt: row.pairingCodeUpdatedAt ?? undefined,
    status: row.status,
    isBotActive: row.isBotActive,
    disconnectReason: row.disconnectReason ?? undefined,
    lastConnectionCode: row.lastConnectionCode ?? undefined,
    lastConnectionError: row.lastConnectionError ?? undefined,
    lastConnectionAt: row.lastConnectionAt ?? undefined,
    qrCode: row.qrCode ?? undefined,
    qrUpdatedAt: row.qrUpdatedAt ?? undefined,
    leaseOwner: row.leaseOwner ?? undefined,
    leaseExpiresAt: row.leaseExpiresAt ?? undefined,
    lastHeartbeatAt: row.lastHeartbeatAt ?? undefined,
    shardKey: row.shardKey,
  };
}

export class PrismaSessionRepository implements ISessionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: CreateSessionInput): Promise<SessionRecord> {
    const id = crypto.randomUUID();
    return this.prisma.$transaction(async (tx) => {
      const session = await tx.whatsAppSession.create({
        data: { ...input, id, shardKey: stableShardKey(id), isBotActive: false },
      });
      await tx.outboxEvent.create({
        data: {
          tenantId: input.tenantId,
          aggregateType: "WhatsAppSession",
          aggregateId: session.id,
          eventType: "SESSION_CREATED",
          payload: encodeJson({
            sessionId: session.id,
            tenantId: input.tenantId,
            ownerUserId: input.ownerUserId,
            pairingMethod: input.pairingMethod,
          }),
        },
      });
      return mapSession(session);
    });
  }

  async listByTenant(tenantId: string): Promise<SessionRecord[]> {
    const rows = await this.prisma.whatsAppSession.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(mapSession);
  }

  async findById(id: string): Promise<SessionRecord | null> {
    const row = await this.prisma.whatsAppSession.findFirst({ where: { id, deletedAt: null } });
    return row ? mapSession(row) : null;
  }

  async findByIdForTenant(id: string, tenantId: string): Promise<SessionRecord | null> {
    const row = await this.prisma.whatsAppSession.findFirst({ where: { id, tenantId, deletedAt: null } });
    return row ? mapSession(row) : null;
  }

  async listStartCandidates(limit: number): Promise<SessionRecord[]> {
    const now = new Date();
    const rows = await this.prisma.whatsAppSession.findMany({
      where: {
        deletedAt: null,
        status: { in: ["NEW", "STARTING", "DISCONNECTED", "LOGGED_OUT", "QR_REQUIRED", "CONNECTING", "CONNECTED"] },

        OR: [
          { leaseOwner: null },
          { leaseExpiresAt: null },
          { leaseExpiresAt: { lt: now } },
        ],
      },
      orderBy: { updatedAt: "asc" },
      take: limit,
    });
    return rows.map(mapSession);
  }

  async acquireLease(sessionId: string, workerId: string, expiresAt: Date): Promise<boolean> {
    const now = new Date();
    const result = await this.prisma.whatsAppSession.updateMany({
      where: {
        id: sessionId,
        deletedAt: null,
        OR: [
          { leaseOwner: workerId },
          { leaseOwner: null },
          { leaseExpiresAt: null },
          { leaseExpiresAt: { lt: now } },
        ],
      },
      data: {
        leaseOwner: workerId,
        leaseExpiresAt: expiresAt,
        lastHeartbeatAt: now,
        revision: { increment: 1 },
      },
    });
    return result.count === 1;
  }

  async renewLease(sessionId: string, workerId: string, expiresAt: Date): Promise<boolean> {
    const result = await this.prisma.whatsAppSession.updateMany({
      where: {
        id: sessionId,
        deletedAt: null,
      },
      data: { leaseOwner: workerId, leaseExpiresAt: expiresAt, lastHeartbeatAt: new Date() },
    });
    return result.count === 1;
  }


  async releaseLease(sessionId: string, workerId: string): Promise<void> {
    await this.prisma.whatsAppSession.updateMany({
      where: { id: sessionId, leaseOwner: workerId },
      data: { leaseOwner: null, leaseExpiresAt: null },
    });
  }

  async updateStatus(
    sessionId: string,
    status: string,
    values: {
      disconnectReason?: string | null;
      phoneE164?: string | null;
      whatsappJid?: string | null;
      connectedAt?: Date | null;
      disconnectedAt?: Date | null;
      lastConnectionCode?: number | null;
      lastConnectionError?: string | null;
      lastConnectionAt?: Date | null;
      clearQr?: boolean;
      clearPairingCode?: boolean;
    } = {},
  ): Promise<void> {
    const data: Prisma.WhatsAppSessionUpdateInput = {
      status,
      revision: { increment: 1 },
    };
    if (values.disconnectReason !== undefined) data.disconnectReason = values.disconnectReason;
    if (values.phoneE164 !== undefined) data.phoneE164 = values.phoneE164;
    if (values.whatsappJid !== undefined) data.whatsappJid = values.whatsappJid;
    if (values.connectedAt !== undefined) data.connectedAt = values.connectedAt;
    if (values.disconnectedAt !== undefined) data.disconnectedAt = values.disconnectedAt;
    if (values.lastConnectionCode !== undefined) data.lastConnectionCode = values.lastConnectionCode;
    if (values.lastConnectionError !== undefined) data.lastConnectionError = values.lastConnectionError;
    if (values.lastConnectionAt !== undefined) data.lastConnectionAt = values.lastConnectionAt;
    if (values.clearQr) {
      data.qrCode = null;
      data.qrUpdatedAt = null;
    }
    if (values.clearPairingCode) {
      data.pairingCode = null;
      data.pairingCodeUpdatedAt = null;
    }
    await this.prisma.whatsAppSession.update({ where: { id: sessionId }, data });
  }

  async saveQr(sessionId: string, qr: string): Promise<void> {
    await this.prisma.whatsAppSession.update({
      where: { id: sessionId },
      data: {
        status: "QR_REQUIRED",
        qrCode: qr,
        qrUpdatedAt: new Date(),
        pairingCode: null,
        pairingCodeUpdatedAt: null,
        lastConnectionError: null,
      },
    });
  }

  async savePairingCode(sessionId: string, code: string): Promise<void> {
    await this.prisma.whatsAppSession.update({
      where: { id: sessionId },
      data: {
        status: "PAIRING_CODE",
        pairingCode: code,
        pairingCodeUpdatedAt: new Date(),
        qrCode: null,
        qrUpdatedAt: null,
        lastConnectionError: null,
      },
    });
  }

  async setBotActive(sessionId: string, tenantId: string, active: boolean): Promise<void> {
    const result = await this.prisma.whatsAppSession.updateMany({
      where: { id: sessionId, tenantId, deletedAt: null },
      data: { isBotActive: active },
    });
    if (result.count !== 1) throw new Error("Sesión no encontrada.");
  }

  async quarantine(sessionId: string, reason: string, connectionCode?: number): Promise<void> {
    await this.prisma.whatsAppSession.updateMany({
      where: { id: sessionId, deletedAt: null },
      data: {
        status: "QUARANTINED",
        isBotActive: false,
        disconnectReason: "quarantined",
        disconnectedAt: new Date(),
        lastConnectionCode: connectionCode ?? null,
        lastConnectionError: reason.slice(0, 4000),
        lastConnectionAt: new Date(),
        leaseOwner: null,
        leaseExpiresAt: null,
        qrCode: null,
        qrUpdatedAt: null,
        pairingCode: null,
        pairingCodeUpdatedAt: null,
      },
    });
  }

  async requestRelink(sessionId: string, tenantId: string): Promise<void> {
    const result = await this.prisma.whatsAppSession.updateMany({
      where: { id: sessionId, tenantId, deletedAt: null },
      data: {
        status: "NEW",
        disconnectReason: null,
        lastConnectionCode: null,
        lastConnectionError: null,
        lastConnectionAt: new Date(),
        qrCode: null,
        qrUpdatedAt: null,
        pairingCode: null,
        pairingCodeUpdatedAt: null,
        leaseOwner: null,
        leaseExpiresAt: null,
      },
    });
    if (result.count !== 1) throw new Error("Sesión no encontrada.");
  }

  async archive(sessionId: string, tenantId: string): Promise<void> {
    const result = await this.prisma.whatsAppSession.updateMany({
      where: { id: sessionId, tenantId, deletedAt: null },
      data: {
        status: "DELETED",
        deletedAt: new Date(),
        isBotActive: false,
        leaseOwner: null,
        leaseExpiresAt: null,
        qrCode: null,
        qrUpdatedAt: null,
        pairingCode: null,
        pairingCodeUpdatedAt: null,
      },
    });
    if (result.count !== 1) throw new Error("Sesión no encontrada.");
  }

  async listConnectedOwnedByWorker(workerId: string): Promise<SessionRecord[]> {
    const rows = await this.prisma.whatsAppSession.findMany({
      where: { leaseOwner: workerId, status: "CONNECTED", deletedAt: null },
    });
    return rows.map(mapSession);
  }

  async findFailoverSession(campaignId: string, failedSessionId: string): Promise<SessionRecord | null> {
    const failed = await this.prisma.whatsAppSession.findFirst({ where: { id: failedSessionId, deletedAt: null } });
    if (!failed) return null;

    const link = await this.prisma.campaignSession.findFirst({
      where: {
        campaignId,
        isEnabled: true,
        sessionId: { not: failedSessionId },
        session: {
          deletedAt: null,
          tenantId: failed.tenantId,
          ownerUserId: failed.ownerUserId,
          status: "CONNECTED",
          isBotActive: true,
          leaseExpiresAt: { gt: new Date() },
        },
      },
      include: { session: true },
      orderBy: { priority: "asc" },
    });
    return link ? mapSession(link.session) : null;
  }
}
