import type { CampaignMessagePayload } from "../../../domain/campaign/campaign-message.js";

export type RecurringCampaignSourceType = "CONNECTOR" | "JERARQUIA";

/** Misma forma que SeleccionJerarquica del Voto1x10HierarchyService. */
export interface RecurringCampaignJerarquiaSelection {
  territorioIds: number[];
  administradorIds: number[];
  gerenteIds: number[];
  movilizadorIds: number[];
}

export interface RecurringCampaignRecord {
  id: string;
  tenantId: string;
  createdByUserId: string;
  sourceType: RecurringCampaignSourceType;
  connectorId?: string;
  jerarquiaSelection: RecurringCampaignJerarquiaSelection;
  mediaAssetId?: string;
  name: string;
  connectorVariables: Record<string, string>;
  sessionIds: string[];
  message: CampaignMessagePayload;
  defaultRegion: string;
  intervalMinutes: number;
  status: string;
  lastRunAt?: Date;
  lastRunOutcome?: string;
  lastRunContactsFound?: number;
  lastRunContactsNew?: number;
  lastRunError?: string;
  lastCampaignId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateRecurringCampaignInput {
  id: string;
  tenantId: string;
  createdByUserId: string;
  sourceType: RecurringCampaignSourceType;
  connectorId?: string;
  jerarquiaSelection?: RecurringCampaignJerarquiaSelection;
  mediaAssetId?: string;
  name: string;
  connectorVariables: Record<string, string>;
  sessionIds: string[];
  message: CampaignMessagePayload;
  defaultRegion: string;
  intervalMinutes: number;
}

export interface RecordRunResultInput {
  outcome: "CREATED" | "EMPTY" | "ERROR";
  contactsFound: number;
  contactsNew: number;
  errorMessage?: string;
  campaignId?: string;
  ranAt: Date;
}

export interface IRecurringCampaignRepository {
  create(input: CreateRecurringCampaignInput): Promise<RecurringCampaignRecord>;
  listByTenant(tenantId: string): Promise<RecurringCampaignRecord[]>;
  findByIdForTenant(id: string, tenantId: string): Promise<RecurringCampaignRecord | null>;
  setStatus(id: string, tenantId: string, status: "ACTIVE" | "PAUSED"): Promise<void>;
  delete(id: string, tenantId: string): Promise<void>;
  /** Todas las campañas recurrentes activas de todos los tenants (el worker corre a nivel global, como el resto de los workers). */
  listActive(): Promise<RecurringCampaignRecord[]>;
  recordRunResult(id: string, result: RecordRunResultInput): Promise<void>;
}
