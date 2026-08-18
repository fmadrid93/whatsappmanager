import crypto from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import type {
  AuthenticatedIntegrationKey,
  ClaimedWebhookDelivery,
  IIntegrationRepository,
  IntegrationApiKeyRecord,
  IntegrationPermission,
  IntegrationRequestLogPage,
  WebhookDeliveryRecord,
  WebhookEndpointRecord,
} from "../../application/ports/repositories/integration.repository.js";
import { decodeJson, encodeJson, toPrismaBytes } from "../../shared/utils/json-buffer.js";

function permissions(payload: Uint8Array): IntegrationPermission[] {
  try {
    const values = decodeJson<unknown>(payload);
    if (!Array.isArray(values)) return [];
    return values.filter((value): value is IntegrationPermission =>
      value === "CAMPAIGN_CREATE" || value === "CAMPAIGN_STATUS",
    );
  } catch {
    return [];
  }
}

function events(payload: Uint8Array): string[] {
  try {
    const values = decodeJson<unknown>(payload);
    return Array.isArray(values) ? values.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}

function mapApiKey(row: {
  id: string;
  tenantId: string;
  createdByUserId: string;
  name: string;
  keyPrefix: string;
  permissionsPayload: Uint8Array;
  status: string;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}): IntegrationApiKeyRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    createdByUserId: row.createdByUserId,
    name: row.name,
    keyPrefix: row.keyPrefix,
    permissions: permissions(row.permissionsPayload),
    status: row.status,
    expiresAt: row.expiresAt ?? undefined,
    lastUsedAt: row.lastUsedAt ?? undefined,
    revokedAt: row.revokedAt ?? undefined,
    createdAt: row.createdAt,
  };
}

function mapWebhook(row: {
  id: string;
  tenantId: string;
  name: string;
  url: string;
  eventsPayload: Uint8Array;
  status: string;
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  createdAt: Date;
}): WebhookEndpointRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    url: row.url,
    events: events(row.eventsPayload),
    status: row.status,
    lastSuccessAt: row.lastSuccessAt ?? undefined,
    lastFailureAt: row.lastFailureAt ?? undefined,
    createdAt: row.createdAt,
  };
}

export class PrismaIntegrationRepository implements IIntegrationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createApiKey(input: {
    tenantId: string;
    createdByUserId: string;
    name: string;
    keyPrefix: string;
    keyHash: string;
    permissions: IntegrationPermission[];
    expiresAt?: Date;
  }): Promise<IntegrationApiKeyRecord> {
    const row = await this.prisma.integrationApiKey.create({
      data: {
        tenantId: input.tenantId,
        createdByUserId: input.createdByUserId,
        name: input.name,
        keyPrefix: input.keyPrefix,
        keyHash: input.keyHash,
        permissionsPayload: encodeJson(input.permissions),
        expiresAt: input.expiresAt,
      },
    });
    return mapApiKey(row);
  }

  async listApiKeys(tenantId: string): Promise<IntegrationApiKeyRecord[]> {
    const rows = await this.prisma.integrationApiKey.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(mapApiKey);
  }

  async findActiveApiKeyByHash(keyHash: string): Promise<AuthenticatedIntegrationKey | null> {
    const row = await this.prisma.integrationApiKey.findUnique({ where: { keyHash } });
    if (!row || row.status !== "ACTIVE" || row.revokedAt) return null;
    if (row.expiresAt && row.expiresAt <= new Date()) return null;
    return mapApiKey(row);
  }

  async touchApiKey(id: string): Promise<void> {
    await this.prisma.integrationApiKey.updateMany({ where: { id, status: "ACTIVE" }, data: { lastUsedAt: new Date() } });
  }

  async revokeApiKey(tenantId: string, id: string): Promise<void> {
    const result = await this.prisma.integrationApiKey.updateMany({
      where: { id, tenantId, status: "ACTIVE" },
      data: { status: "REVOKED", revokedAt: new Date() },
    });
    if (result.count !== 1) throw new Error("API key no encontrada o ya revocada.");
  }

  async createWebhook(input: {
    tenantId: string;
    createdByUserId: string;
    name: string;
    url: string;
    secretPayload: Buffer;
    events: string[];
  }): Promise<WebhookEndpointRecord> {
    const row = await this.prisma.webhookEndpoint.create({
      data: {
        tenantId: input.tenantId,
        createdByUserId: input.createdByUserId,
        name: input.name,
        url: input.url,
        secretPayload: toPrismaBytes(input.secretPayload),
        eventsPayload: encodeJson(input.events),
      },
    });
    return mapWebhook(row);
  }

  async listWebhooks(tenantId: string): Promise<WebhookEndpointRecord[]> {
    const rows = await this.prisma.webhookEndpoint.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(mapWebhook);
  }

  async updateWebhook(input: {
    tenantId: string;
    id: string;
    name?: string;
    url?: string;
    events?: string[];
    status?: "ACTIVE" | "DISABLED";
  }): Promise<void> {
    const result = await this.prisma.webhookEndpoint.updateMany({
      where: { id: input.id, tenantId: input.tenantId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.url !== undefined ? { url: input.url } : {}),
        ...(input.events !== undefined ? { eventsPayload: encodeJson(input.events) } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      },
    });
    if (result.count !== 1) throw new Error("Webhook no encontrado.");
  }

  async enqueueEvent(input: {
    tenantId: string;
    eventType: string;
    aggregateType?: string;
    aggregateId?: string;
    payload: Record<string, unknown>;
    webhookId?: string;
  }): Promise<number> {
    const webhooks = await this.prisma.webhookEndpoint.findMany({
      where: {
        tenantId: input.tenantId,
        status: "ACTIVE",
        ...(input.webhookId ? { id: input.webhookId } : {}),
      },
      select: { id: true, eventsPayload: true },
    });
    const targets = webhooks.filter((webhook) =>
      input.webhookId || events(webhook.eventsPayload).includes(input.eventType),
    );
    if (targets.length === 0) return 0;
    await this.prisma.webhookDelivery.createMany({
      data: targets.map((webhook) => ({
        tenantId: input.tenantId,
        webhookId: webhook.id,
        eventType: input.eventType,
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        payload: encodeJson({
          id: crypto.randomUUID(),
          type: input.eventType,
          occurredAt: new Date().toISOString(),
          tenantId: input.tenantId,
          aggregateType: input.aggregateType,
          aggregateId: input.aggregateId,
          data: input.payload,
        }),
      })),
    });
    return targets.length;
  }

  async listDeliveries(input: {
    tenantId: string;
    webhookId?: string;
    status?: string;
    take: number;
    skip: number;
  }): Promise<{ items: WebhookDeliveryRecord[]; total: number }> {
    const where: Prisma.WebhookDeliveryWhereInput = {
      tenantId: input.tenantId,
      ...(input.webhookId ? { webhookId: input.webhookId } : {}),
      ...(input.status ? { status: input.status } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.webhookDelivery.findMany({
        where,
        include: { webhook: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: input.take,
        skip: input.skip,
      }),
      this.prisma.webhookDelivery.count({ where }),
    ]);
    return {
      total,
      items: rows.map((row) => ({
        id: row.id,
        webhookId: row.webhookId,
        webhookName: row.webhook.name,
        eventType: row.eventType,
        aggregateType: row.aggregateType ?? undefined,
        aggregateId: row.aggregateId ?? undefined,
        status: row.status,
        attemptCount: row.attemptCount,
        responseStatus: row.responseStatus ?? undefined,
        responseBody: row.responseBody ?? undefined,
        lastError: row.lastError ?? undefined,
        createdAt: row.createdAt,
        deliveredAt: row.deliveredAt ?? undefined,
        failedAt: row.failedAt ?? undefined,
      })),
    };
  }

  async retryDelivery(tenantId: string, deliveryId: string): Promise<void> {
    const result = await this.prisma.webhookDelivery.updateMany({
      where: { id: deliveryId, tenantId },
      data: {
        status: "PENDING",
        attemptCount: 0,
        availableAt: new Date(),
        processingAt: null,
        deliveredAt: null,
        failedAt: null,
        responseStatus: null,
        responseBody: null,
        lastError: null,
        lockedBy: null,
        lockExpiresAt: null,
      },
    });
    if (result.count !== 1) throw new Error("Entrega de webhook no encontrada.");
  }

  async claimNextDelivery(input: {
    workerId: string;
    lockExpiresAt: Date;
  }): Promise<ClaimedWebhookDelivery | null> {
    const now = new Date();
    await this.prisma.webhookDelivery.updateMany({
      where: { status: "PROCESSING", lockExpiresAt: { lt: now } },
      data: { status: "PENDING", processingAt: null, lockedBy: null, lockExpiresAt: null, availableAt: now },
    });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = await this.prisma.webhookDelivery.findFirst({
        where: { status: "PENDING", availableAt: { lte: now }, webhook: { is: { status: "ACTIVE" } } },
        orderBy: { createdAt: "asc" },
        include: { webhook: true },
      });
      if (!candidate) return null;
      const claimed = await this.prisma.webhookDelivery.updateMany({
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
        return {
          id: candidate.id,
          webhookId: candidate.webhookId,
          tenantId: candidate.tenantId,
          url: candidate.webhook.url,
          secretPayload: Buffer.from(candidate.webhook.secretPayload),
          eventType: candidate.eventType,
          aggregateType: candidate.aggregateType ?? undefined,
          aggregateId: candidate.aggregateId ?? undefined,
          payload: Buffer.from(candidate.payload),
          attemptCount: candidate.attemptCount + 1,
          maxAttempts: candidate.maxAttempts,
        };
      }
    }
    return null;
  }

  async markDeliverySuccess(input: {
    id: string;
    responseStatus: number;
    responseBody?: string;
  }): Promise<void> {
    const delivery = await this.prisma.webhookDelivery.update({
      where: { id: input.id },
      data: {
        status: "DELIVERED",
        deliveredAt: new Date(),
        responseStatus: input.responseStatus,
        responseBody: input.responseBody?.slice(0, 2000),
        lastError: null,
        lockedBy: null,
        lockExpiresAt: null,
      },
      select: { webhookId: true },
    });
    await this.prisma.webhookEndpoint.update({
      where: { id: delivery.webhookId },
      data: { lastSuccessAt: new Date() },
    });
  }

  async markDeliveryFailure(input: {
    id: string;
    responseStatus?: number;
    responseBody?: string;
    error: string;
    retryAt: Date;
  }): Promise<void> {
    const row = await this.prisma.webhookDelivery.findUniqueOrThrow({ where: { id: input.id } });
    const failed = row.attemptCount >= row.maxAttempts;
    await this.prisma.$transaction([
      this.prisma.webhookDelivery.update({
        where: { id: input.id },
        data: failed
          ? {
              status: "FAILED",
              failedAt: new Date(),
              responseStatus: input.responseStatus,
              responseBody: input.responseBody?.slice(0, 2000),
              lastError: input.error.slice(0, 2000),
              lockedBy: null,
              lockExpiresAt: null,
            }
          : {
              status: "PENDING",
              availableAt: input.retryAt,
              processingAt: null,
              responseStatus: input.responseStatus,
              responseBody: input.responseBody?.slice(0, 2000),
              lastError: input.error.slice(0, 2000),
              lockedBy: null,
              lockExpiresAt: null,
            },
      }),
      this.prisma.webhookEndpoint.update({
        where: { id: row.webhookId },
        data: { lastFailureAt: new Date() },
      }),
    ]);
  }

  async logRequest(input: {
    tenantId: string;
    apiKeyId?: string;
    endpoint: string;
    method: string;
    statusCode: number;
    durationMs: number;
    requestId?: string;
    idempotencyKey?: string;
    remoteIp?: string;
    errorMessage?: string;
  }): Promise<void> {
    await this.prisma.integrationRequestLog.create({ data: input });
  }

  async listRequestLogs(input: {
    tenantId: string;
    statusCode?: number;
    take: number;
    skip: number;
  }): Promise<IntegrationRequestLogPage> {
    const where: Prisma.IntegrationRequestLogWhereInput = {
      tenantId: input.tenantId,
      ...(input.statusCode ? { statusCode: input.statusCode } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.integrationRequestLog.findMany({
        where,
        include: { apiKey: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: input.take,
        skip: input.skip,
      }),
      this.prisma.integrationRequestLog.count({ where }),
    ]);
    return {
      total,
      items: rows.map((row) => ({
        id: row.id,
        apiKeyId: row.apiKeyId ?? undefined,
        apiKeyName: row.apiKey?.name ?? undefined,
        endpoint: row.endpoint,
        method: row.method,
        statusCode: row.statusCode,
        durationMs: row.durationMs,
        requestId: row.requestId ?? undefined,
        idempotencyKey: row.idempotencyKey ?? undefined,
        remoteIp: row.remoteIp ?? undefined,
        errorMessage: row.errorMessage ?? undefined,
        createdAt: row.createdAt,
      })),
    };
  }

  async counts(tenantId: string): Promise<{
    activeApiKeys: number;
    activeWebhooks: number;
    pendingDeliveries: number;
    failedDeliveries: number;
    requests24h: number;
    failedRequests24h: number;
  }> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [activeApiKeys, activeWebhooks, pendingDeliveries, failedDeliveries, requests24h, failedRequests24h] = await this.prisma.$transaction([
      this.prisma.integrationApiKey.count({ where: { tenantId, status: "ACTIVE", revokedAt: null } }),
      this.prisma.webhookEndpoint.count({ where: { tenantId, status: "ACTIVE" } }),
      this.prisma.webhookDelivery.count({ where: { tenantId, status: { in: ["PENDING", "PROCESSING"] } } }),
      this.prisma.webhookDelivery.count({ where: { tenantId, status: "FAILED" } }),
      this.prisma.integrationRequestLog.count({ where: { tenantId, createdAt: { gte: since } } }),
      this.prisma.integrationRequestLog.count({ where: { tenantId, createdAt: { gte: since }, statusCode: { gte: 400 } } }),
    ]);
    return { activeApiKeys, activeWebhooks, pendingDeliveries, failedDeliveries, requests24h, failedRequests24h };
  }
}
