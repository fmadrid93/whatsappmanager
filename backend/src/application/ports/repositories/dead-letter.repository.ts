export interface DeadLetterRecord {
  id: string;
  queueItemId: string;
  campaignId: string;
  sessionId?: string;
  recipientE164?: string;
  reasonCode: string;
  reasonMessage: string;
  attemptCount: number;
  failedAt: Date;
  resolvedAt?: Date;
}

export interface IDeadLetterRepository {
  listByCampaign(tenantId: string, campaignId: string, take: number): Promise<DeadLetterRecord[]>;
  requeue(tenantId: string, deadLetterId: string): Promise<void>;
}
