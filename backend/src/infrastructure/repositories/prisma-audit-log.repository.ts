import type { Prisma, PrismaClient } from "@prisma/client";
import type {
  AuditLogOptions,
  AuditLogPage,
  AuditLogQuery,
  AuditLogRecord,
  CreateAuditLogInput,
  IAuditLogRepository,
} from "../../application/ports/repositories/audit-log.repository.js";
import { decodeJson, encodeJson } from "../../shared/utils/json-buffer.js";

function metadata(payload: Uint8Array | null): Record<string, unknown> | null {
  if (!payload) return null;
  try {
    return decodeJson<Record<string, unknown>>(payload);
  } catch {
    return { warning: "No se pudo decodificar metadataPayload." };
  }
}

type Row = Prisma.AuditLogGetPayload<{
  include: { actor: { select: { email: true; displayName: true } } };
}>;

function mapRow(row: Row): AuditLogRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    actorUserId: row.actorUserId,
    actorEmail: row.actor?.email ?? null,
    actorName: row.actor?.displayName ?? null,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    result: row.result,
    requestId: row.requestId,
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
    metadata: metadata(row.metadataPayload),
    createdAt: row.createdAt,
  };
}

export class PrismaAuditLogRepository implements IAuditLogRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: CreateAuditLogInput): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        result: input.result ?? "SUCCESS",
        requestId: input.requestId,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        metadataPayload: input.metadata ? encodeJson(input.metadata) : undefined,
      },
    });
  }

  async findEntityByRequestId(tenantId: string, entityType: string, requestId: string): Promise<AuditLogRecord | null> {
    const row = await this.prisma.auditLog.findFirst({
      where: { tenantId, entityType, requestId },
      include: { actor: { select: { email: true, displayName: true } } },
      orderBy: { createdAt: "desc" },
    });
    return row ? mapRow(row) : null;
  }

  async listByTenant(tenantId: string, query: AuditLogQuery): Promise<AuditLogPage> {
    const search = query.search?.trim();
    const where: Prisma.AuditLogWhereInput = {
      tenantId,
      ...(query.action ? { action: query.action } : {}),
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.result ? { result: query.result } : {}),
      ...(query.actorUserId ? { actorUserId: query.actorUserId } : {}),
      ...((query.from || query.to) ? {
        createdAt: {
          ...(query.from ? { gte: query.from } : {}),
          ...(query.to ? { lte: query.to } : {}),
        },
      } : {}),
      ...(search ? {
        OR: [
          { action: { contains: search } },
          { entityType: { contains: search } },
          { entityId: { contains: search } },
          { requestId: { contains: search } },
          { ipAddress: { contains: search } },
          { actor: { is: { email: { contains: search } } } },
          { actor: { is: { displayName: { contains: search } } } },
        ],
      } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        include: { actor: { select: { email: true, displayName: true } } },
        orderBy: { createdAt: "desc" },
        take: query.take,
        skip: query.skip,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { items: rows.map(mapRow), total };
  }

  async options(tenantId: string): Promise<AuditLogOptions> {
    const [actions, entityTypes, actors] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where: { tenantId },
        distinct: ["action"],
        select: { action: true },
        orderBy: { action: "asc" },
        take: 500,
      }),
      this.prisma.auditLog.findMany({
        where: { tenantId },
        distinct: ["entityType"],
        select: { entityType: true },
        orderBy: { entityType: "asc" },
        take: 200,
      }),
      this.prisma.appUser.findMany({
        where: { tenantId },
        select: { id: true, email: true, displayName: true },
        orderBy: { displayName: "asc" },
      }),
    ]);
    return {
      actions: actions.map((item) => item.action),
      entityTypes: entityTypes.map((item) => item.entityType),
      actors,
    };
  }
}
