export interface TenantCapacitySnapshot {
  tenantId: string;
  period: string;
  sessions: number;
  activeCampaigns: number;
  pendingMessages: number;
  globalPendingMessages: number;
  messagesReserved: number;
  messagesSent: number;
  limits: {
    maxSessions: number;
    maxConcurrentCampaigns: number;
    maxCampaignContacts: number;
    maxPendingMessages: number;
    monthlyMessageLimit: number;
  };
}

export interface ITenantCapacityRepository {
  assertSessionCapacity(tenantId: string): Promise<void>;
  reserveCampaign(input: {
    tenantId: string;
    campaignId: string;
    messageCount: number;
  }): Promise<void>;
  releaseCampaignReservation(input: {
    tenantId: string;
    campaignId: string;
    messageCount: number;
  }): Promise<void>;
  recordMessageSent(input: {
    tenantId: string;
    queueItemId: string;
  }): Promise<void>;
  getSnapshot(tenantId: string): Promise<TenantCapacitySnapshot>;
}
