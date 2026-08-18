import type { ITenantCapacityRepository } from "../ports/repositories/tenant-capacity.repository.js";

export class TenantCapacityService {
  constructor(private readonly capacity: ITenantCapacityRepository) {}

  assertSessionCapacity(tenantId: string): Promise<void> {
    return this.capacity.assertSessionCapacity(tenantId);
  }

  reserveCampaign(input: { tenantId: string; campaignId: string; messageCount: number }): Promise<void> {
    return this.capacity.reserveCampaign(input);
  }

  releaseCampaignReservation(input: { tenantId: string; campaignId: string; messageCount: number }): Promise<void> {
    return this.capacity.releaseCampaignReservation(input);
  }

  recordMessageSent(input: { tenantId: string; queueItemId: string }): Promise<void> {
    return this.capacity.recordMessageSent(input);
  }

  snapshot(tenantId: string) {
    return this.capacity.getSnapshot(tenantId);
  }
}
