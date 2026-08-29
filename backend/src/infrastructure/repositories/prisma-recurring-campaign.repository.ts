import type { PrismaClient, RecurringCampaign } from "@prisma/client";
import type {
  CreateRecurringCampaignInput,
  IRecurringCampaignRepository,
  RecordRunResultInput,
  RecurringCampaignRecord,
  RecurringCampaignSourceType,
} from "../../application/ports/repositories/recurring-campaign.repository.js";
import { decodeJson, encodeJson } from "../../shared/utils/json-buffer.js";

function mapRow(row: RecurringCampaign): RecurringCampaignRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    createdByUserId: row.createdByUserId,
    sourceType: row.sourceType as RecurringCampaignSourceType,
    connectorId: row.connectorId ?? undefined,
    jerarquiaSelection: decodeJson(row.jerarquiaSelectionPayload),
    mediaAssetId: row.mediaAssetId ?? undefined,
    name: row.name,
    connectorVariables: decodeJson(row.connectorVariablesPayload),
    sessionIds: decodeJson(row.sessionIdsPayload),
    message: decodeJson(row.messagePayload),
    defaultRegion: row.defaultRegion,
    intervalMinutes: row.intervalMinutes,
    status: row.status,
    lastRunAt: row.lastRunAt ?? undefined,
    lastRunOutcome: row.lastRunOutcome ?? undefined,
    lastRunContactsFound: row.lastRunContactsFound ?? undefined,
    lastRunContactsNew: row.lastRunContactsNew ?? undefined,
    lastRunError: row.lastRunError ?? undefined,
    lastCampaignId: row.lastCampaignId ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const EMPTY_JERARQUIA_SELECTION = { territorioIds: [], administradorIds: [], gerenteIds: [], movilizadorIds: [] };

export class PrismaRecurringCampaignRepository implements IRecurringCampaignRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: CreateRecurringCampaignInput): Promise<RecurringCampaignRecord> {
    const row = await this.prisma.recurringCampaign.create({
      data: {
        id: input.id,
        tenantId: input.tenantId,
        createdByUserId: input.createdByUserId,
        sourceType: input.sourceType,
        connectorId: input.connectorId,
        jerarquiaSelectionPayload: encodeJson(input.jerarquiaSelection ?? EMPTY_JERARQUIA_SELECTION),
        mediaAssetId: input.mediaAssetId,
        name: input.name,
        connectorVariablesPayload: encodeJson(input.connectorVariables),
        sessionIdsPayload: encodeJson(input.sessionIds),
        messagePayload: encodeJson(input.message),
        defaultRegion: input.defaultRegion,
        intervalMinutes: input.intervalMinutes,
      },
    });
    return mapRow(row);
  }

  async listByTenant(tenantId: string): Promise<RecurringCampaignRecord[]> {
    const rows = await this.prisma.recurringCampaign.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(mapRow);
  }

  async findByIdForTenant(id: string, tenantId: string): Promise<RecurringCampaignRecord | null> {
    const row = await this.prisma.recurringCampaign.findFirst({ where: { id, tenantId } });
    return row ? mapRow(row) : null;
  }

  async setStatus(id: string, tenantId: string, status: "ACTIVE" | "PAUSED"): Promise<void> {
    await this.prisma.recurringCampaign.updateMany({ where: { id, tenantId }, data: { status } });
  }

  async delete(id: string, tenantId: string): Promise<void> {
    await this.prisma.recurringCampaign.deleteMany({ where: { id, tenantId } });
  }

  async listActive(): Promise<RecurringCampaignRecord[]> {
    const rows = await this.prisma.recurringCampaign.findMany({ where: { status: "ACTIVE" } });
    return rows.map(mapRow);
  }

  async recordRunResult(id: string, result: RecordRunResultInput): Promise<void> {
    await this.prisma.recurringCampaign.update({
      where: { id },
      data: {
        lastRunAt: result.ranAt,
        lastRunOutcome: result.outcome,
        lastRunContactsFound: result.contactsFound,
        lastRunContactsNew: result.contactsNew,
        lastRunError: result.errorMessage ?? null,
        lastCampaignId: result.campaignId ?? undefined,
      },
    });
  }
}
