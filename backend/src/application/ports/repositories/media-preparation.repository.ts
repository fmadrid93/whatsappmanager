export interface MediaPreparationJobRecord {
  id: string;
  tenantId: string;
  campaignId: string;
  mediaAssetId: string;
  sessionId: string;
  status: string;
  attemptCount: number;
  maxAttempts: number;
}

export interface IMediaPreparationRepository {
  ensureCampaignJobs(input: {
    tenantId: string;
    campaignId: string;
    mediaAssetId: string;
    sessionIds: string[];
  }): Promise<void>;
  claimNextForSession(input: {
    sessionId: string;
    workerId: string;
    lockExpiresAt: Date;
  }): Promise<MediaPreparationJobRecord | null>;
  markPrepared(id: string): Promise<void>;
  markRetryOrFailed(input: {
    id: string;
    errorMessage: string;
    retryAt: Date;
  }): Promise<"PENDING" | "FAILED">;
  areAllPrepared(campaignId: string): Promise<boolean>;
}
