import type { QueueItemRecord } from "../../../domain/queue/queue-item.js";

export interface CampaignMessageRecord {
  id: string;
  campaignId: string;
  assignedSessionId?: string;
  contactName?: string;
  recipientRaw: string;
  recipientE164?: string;
  status: string;
  attemptCount: number;
  maxAttempts: number;
  sentMessageId?: string;
  lastErrorCode?: string;
  lastErrorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
  sentAt?: Date;
  failedAt?: Date;
}

export interface CampaignMessagePage {
  items: CampaignMessageRecord[];
  total: number;
}

export interface AutomaticFailoverCampaignResult {
  campaignId: string;
  movedMessages: number;
  targetSessionIds: string[];
  pausedBecauseNoReplacement: boolean;
}

export interface AutomaticFailoverResult {
  sourceSessionId: string;
  totalMoved: number;
  campaigns: AutomaticFailoverCampaignResult[];
}

export interface SessionQuarantineResult {
  sourceSessionId: string;
  campaignIds: string[];
  pausedCampaignIds: string[];
  heldMessages: number;
}

export interface CampaignPerformanceStats {
  total: number;
  pending: number;
  processing: number;
  sent: number;
  failed: number;
  held: number;
  sentLastMinute: number;
  failedLastMinute: number;
}

export interface CampaignRecoveryStats {
  openMessages: number;
  recoverableMessages: number;
  heldRestrictionMessages: number;
  inFlightLockedMessages: number;
}

export interface CampaignRecoveryResult extends CampaignRecoveryStats {
  movedMessages: number;
  untouchedOpenMessages: number;
  targetSessionIds: string[];
}

export interface IMessageQueueRepository {
  listByCampaign(input: {
    tenantId: string;
    campaignId: string;
    status?: string;
    take: number;
    skip: number;
  }): Promise<CampaignMessagePage>;
  getCampaignPerformance(input: {
    tenantId: string;
    campaignId: string;
    since: Date;
  }): Promise<CampaignPerformanceStats>;
  getCampaignRecoveryStats(input: {
    tenantId: string;
    campaignId: string;
  }): Promise<CampaignRecoveryStats>;
  recoverTechnicalPending(input: {
    tenantId: string;
    campaignId: string;
    targetSessionIds: string[];
    availableAt: Date;
  }): Promise<CampaignRecoveryResult>;
  claimNext(input: {
    sessionId: string;
    workerId: string;
    lockExpiresAt: Date;
  }): Promise<QueueItemRecord | null>;
  setRecipientJid(id: string, jid: string): Promise<void>;
  releaseForReconciliation(id: string, retryAt: Date): Promise<void>;
  markSent(id: string, messageId: string): Promise<void>;
  markRetryOrDeadLetter(input: {
    id: string;
    errorCode: string;
    errorMessage: string;
    retryAt: Date;
    forceDeadLetter?: boolean;
  }): Promise<"PENDING" | "DEAD_LETTER">;
  pauseCampaignsForSession(input: {
    sessionId: string;
    errorCode: string;
    errorMessage: string;
    retryAt: Date;
  }): Promise<string[]>;
  autoFailoverTechnical(input: {
    sessionId: string;
    errorCode: string;
    errorMessage: string;
    availableAt: Date;
    maxTargets: number;
  }): Promise<AutomaticFailoverResult>;
  quarantineSessionQueue(input: {
    sessionId: string;
    errorCode: string;
    errorMessage: string;
    availableAt: Date;
  }): Promise<SessionQuarantineResult>;
  listAffectedCampaignIds(sessionId: string): Promise<string[]>;
  reassignForFailover(input: {
    campaignId: string;
    failedSessionId: string;
    replacementSessionId: string;
  }): Promise<number>;
  releaseWithoutReplacement(sessionId: string, retryAt: Date): Promise<number>;
}
