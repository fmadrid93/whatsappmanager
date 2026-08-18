import type { Prisma, PrismaClient } from "@prisma/client";
import type {
  ExternalConnectorAuthType,
  ExternalConnectorContactMapping,
  ExternalConnectorExecutionRecord,
  ExternalConnectorMethod,
  ExternalConnectorOutcome,
  ExternalConnectorPurpose,
  ExternalConnectorRecord,
  ExternalConnectorSecretRecord,
  IExternalConnectorRepository,
} from "../../application/ports/repositories/external-connector.repository.js";
import { decodeJson, encodeJson, toPrismaBytes } from "../../shared/utils/json-buffer.js";

function readHeaders(payload: Uint8Array): Record<string, string> {
  try {
    const value = decodeJson<unknown>(payload);
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
    );
  } catch {
    return {};
  }
}

function readMappings(payload: Uint8Array): ExternalConnectorContactMapping[] {
  try {
    const value = decodeJson<unknown>(payload);
    if (!Array.isArray(value)) return [];
    return value.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const sourcePath = "sourcePath" in item && typeof item.sourcePath === "string" ? item.sourcePath : "";
      const targetVariable = "targetVariable" in item && typeof item.targetVariable === "string" ? item.targetVariable : "";
      return sourcePath && targetVariable ? [{ sourcePath, targetVariable }] : [];
    });
  } catch {
    return [];
  }
}

type ConnectorRow = {
  id: string;
  tenantId: string;
  createdByUserId: string;
  name: string;
  purpose: string;
  method: string;
  urlTemplate: string;
  headersPayload: Uint8Array;
  bodyTemplate: string | null;
  authType: string;
  authName: string | null;
  secretPayload: Uint8Array | null;
  timeoutMs: number;
  itemsPath: string | null;
  phonePath: string | null;
  namePath: string | null;
  contactMappingsPayload: Uint8Array;
  status: string;
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function mapConnector(row: ConnectorRow): ExternalConnectorRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    createdByUserId: row.createdByUserId,
    name: row.name,
    purpose: row.purpose as ExternalConnectorPurpose,
    method: row.method as ExternalConnectorMethod,
    urlTemplate: row.urlTemplate,
    headers: readHeaders(row.headersPayload),
    bodyTemplate: row.bodyTemplate ?? undefined,
    authType: row.authType as ExternalConnectorAuthType,
    authName: row.authName ?? undefined,
    hasSecret: Boolean(row.secretPayload?.length),
    timeoutMs: row.timeoutMs,
    itemsPath: row.itemsPath ?? undefined,
    phonePath: row.phonePath ?? undefined,
    namePath: row.namePath ?? undefined,
    contactMappings: readMappings(row.contactMappingsPayload),
    status: row.status,
    lastSuccessAt: row.lastSuccessAt ?? undefined,
    lastFailureAt: row.lastFailureAt ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class PrismaExternalConnectorRepository implements IExternalConnectorRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: Parameters<IExternalConnectorRepository["create"]>[0]): Promise<ExternalConnectorRecord> {
    const row = await this.prisma.externalConnector.create({
      data: {
        tenantId: input.tenantId,
        createdByUserId: input.createdByUserId,
        name: input.name,
        purpose: input.purpose,
        method: input.method,
        urlTemplate: input.urlTemplate,
        headersPayload: encodeJson(input.headers),
        bodyTemplate: input.bodyTemplate,
        authType: input.authType,
        authName: input.authName,
        secretPayload: input.secretPayload ? toPrismaBytes(input.secretPayload) : undefined,
        timeoutMs: input.timeoutMs,
        itemsPath: input.itemsPath,
        phonePath: input.phonePath,
        namePath: input.namePath,
        contactMappingsPayload: encodeJson(input.contactMappings),
      },
    });
    return mapConnector(row);
  }

  async listByTenant(input: {
    tenantId: string;
    purpose?: ExternalConnectorPurpose;
    status?: string;
  }): Promise<ExternalConnectorRecord[]> {
    const rows = await this.prisma.externalConnector.findMany({
      where: {
        tenantId: input.tenantId,
        ...(input.purpose ? { purpose: input.purpose } : {}),
        ...(input.status ? { status: input.status } : {}),
      },
      orderBy: [{ status: "asc" }, { name: "asc" }],
    });
    return rows.map(mapConnector);
  }

  async findById(tenantId: string, id: string): Promise<ExternalConnectorSecretRecord | null> {
    const row = await this.prisma.externalConnector.findFirst({ where: { id, tenantId } });
    if (!row) return null;
    return {
      ...mapConnector(row),
      secretPayload: row.secretPayload ? Buffer.from(row.secretPayload) : undefined,
    };
  }

  async setStatus(tenantId: string, id: string, status: "ACTIVE" | "DISABLED"): Promise<void> {
    const result = await this.prisma.externalConnector.updateMany({
      where: { id, tenantId },
      data: { status },
    });
    if (result.count !== 1) throw new Error("Conector externo no encontrado.");
  }

  async createExecution(input: Parameters<IExternalConnectorRepository["createExecution"]>[0]): Promise<void> {
    const success = input.outcome === "SUCCESS" || input.outcome === "NOT_FOUND";
    await this.prisma.$transaction([
      this.prisma.externalConnectorExecution.create({
        data: {
          tenantId: input.tenantId,
          connectorId: input.connectorId,
          contextType: input.contextType,
          contextId: input.contextId,
          outcome: input.outcome,
          method: input.method,
          requestUrl: input.requestUrl.slice(0, 1000),
          responseStatus: input.responseStatus,
          durationMs: input.durationMs,
          mappedCount: input.mappedCount ?? 0,
          responsePreview: input.responsePreview?.slice(0, 2000),
          errorMessage: input.errorMessage?.slice(0, 2000),
        },
      }),
      this.prisma.externalConnector.update({
        where: { id: input.connectorId },
        data: success ? { lastSuccessAt: new Date() } : { lastFailureAt: new Date() },
      }),
    ]);
  }

  async listExecutions(input: {
    tenantId: string;
    connectorId?: string;
    outcome?: ExternalConnectorOutcome;
    take: number;
    skip: number;
  }): Promise<{ items: ExternalConnectorExecutionRecord[]; total: number }> {
    const where: Prisma.ExternalConnectorExecutionWhereInput = {
      tenantId: input.tenantId,
      ...(input.connectorId ? { connectorId: input.connectorId } : {}),
      ...(input.outcome ? { outcome: input.outcome } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.externalConnectorExecution.findMany({
        where,
        include: { connector: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: input.take,
        skip: input.skip,
      }),
      this.prisma.externalConnectorExecution.count({ where }),
    ]);
    return {
      total,
      items: rows.map((row) => ({
        id: row.id,
        tenantId: row.tenantId,
        connectorId: row.connectorId,
        connectorName: row.connector.name,
        contextType: row.contextType,
        contextId: row.contextId ?? undefined,
        outcome: row.outcome as ExternalConnectorOutcome,
        method: row.method,
        requestUrl: row.requestUrl,
        responseStatus: row.responseStatus ?? undefined,
        durationMs: row.durationMs,
        mappedCount: row.mappedCount,
        responsePreview: row.responsePreview ?? undefined,
        errorMessage: row.errorMessage ?? undefined,
        createdAt: row.createdAt,
      })),
    };
  }

  async counts(tenantId: string): Promise<{
    activeConnectors: number;
    connectorExecutions24h: number;
    failedConnectorExecutions24h: number;
  }> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [activeConnectors, connectorExecutions24h, failedConnectorExecutions24h] = await this.prisma.$transaction([
      this.prisma.externalConnector.count({ where: { tenantId, status: "ACTIVE" } }),
      this.prisma.externalConnectorExecution.count({ where: { tenantId, createdAt: { gte: since } } }),
      this.prisma.externalConnectorExecution.count({ where: { tenantId, createdAt: { gte: since }, outcome: "ERROR" } }),
    ]);
    return { activeConnectors, connectorExecutions24h, failedConnectorExecutions24h };
  }
}
