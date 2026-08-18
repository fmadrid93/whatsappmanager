import type { CampaignMessagePayload } from "../../../domain/campaign/campaign-message.js";

export interface CampaignRecord {
  id: string;
  tenantId: string;
  name: string;
  status: string;
  mediaAssetId?: string;
  messagePayload: Buffer;
  totalMessages: number;
  sentMessages: number;
  failedMessages: number;
  createdAt: Date;
  startedAt?: Date;
  pausedAt?: Date;
  completedAt?: Date;
  cancelledAt?: Date;
  sessionIds?: string[];
}

export interface CreateCampaignInput {
  id: string;
  tenantId: string;
  ownerUserId: string;
  name: string;
  sessionIds: string[];
  contacts: Array<{ name?: string; raw: string; e164: string; variables: Record<string, string> }>;
  message: CampaignMessagePayload;
  mediaAssetId?: string;
}

export interface AddCampaignSessionsResult {
  addedSessionIds: string[];
  configuredSessionIds: string[];
}

export interface ICampaignRepository {
  createWithQueue(input: CreateCampaignInput): Promise<CampaignRecord>;
  listByTenant(tenantId: string): Promise<CampaignRecord[]>;
  findByIdForTenant(id: string, tenantId: string): Promise<CampaignRecord | null>;
  setPreparing(id: string, tenantId: string): Promise<void>;
  pause(id: string, tenantId: string): Promise<void>;
  cancel(id: string, tenantId: string): Promise<void>;
  setRunning(id: string): Promise<boolean>;
  setCompleted(id: string): Promise<void>;
  listPreparing(limit: number): Promise<CampaignRecord[]>;
  getSessionIds(campaignId: string): Promise<string[]>;
  addSessions(input: {
    campaignId: string;
    tenantId: string;
    ownerUserId: string;
    sessionIds: string[];
  }): Promise<AddCampaignSessionsResult>;
  refreshStats(campaignId: string): Promise<void>;
}
