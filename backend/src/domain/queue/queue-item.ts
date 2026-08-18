export interface QueueItemRecord {
  id: string;
  tenantId: string;
  campaignId: string;
  assignedSessionId?: string;
  mediaAssetId?: string;
  contactName?: string;
  recipientRaw: string;
  recipientE164?: string;
  recipientJid?: string;
  messageType: string;
  payload?: Buffer;
  status: string;
  priority: number;
  attemptCount: number;
  maxAttempts: number;
  idempotencyKey: string;
  clientMessageId: string;
}
