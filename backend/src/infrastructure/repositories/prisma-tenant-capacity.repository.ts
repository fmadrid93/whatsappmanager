import type { PrismaClient } from "@prisma/client";
import type {
  ITenantCapacityRepository,
  TenantCapacitySnapshot,
} from "../../application/ports/repositories/tenant-capacity.repository.js";
import { HttpError } from "../../shared/errors/http-error.js";

interface CapacityDefaults {
  maxSessions: number;
  maxConcurrentCampaigns: number;
  maxCampaignContacts: number;
  maxPendingMessages: number;
  monthlyMessageLimit: number;
  globalMaxPendingMessages: number;
}

function currentPeriod(date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export class PrismaTenantCapacityRepository implements ITenantCapacityRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly defaults: CapacityDefaults,
  ) {}

  private policyCreate(tenantId: string) {
    return {
      tenantId,
      maxSessions: this.defaults.maxSessions,
      maxConcurrentCampaigns: this.defaults.maxConcurrentCampaigns,
      maxCampaignContacts: this.defaults.maxCampaignContacts,
      maxPendingMessages: this.defaults.maxPendingMessages,
      monthlyMessageLimit: this.defaults.monthlyMessageLimit,
    };
  }

  async assertSessionCapacity(tenantId: string): Promise<void> {
    const [policy, sessions] = await Promise.all([
      this.prisma.tenantCapacityPolicy.upsert({
        where: { tenantId },
        create: this.policyCreate(tenantId),
        update: {},
      }),
      this.prisma.whatsAppSession.count({ where: { tenantId, status: { not: "DELETED" } } }),
    ]);
    if (sessions >= policy.maxSessions) {
      throw new HttpError(429, `El tenant alcanzó el límite de ${policy.maxSessions} sesiones.`);
    }
  }

  async reserveCampaign(input: { tenantId: string; campaignId: string; messageCount: number }): Promise<void> {
    if (input.messageCount <= 0) throw new HttpError(400, "La campaña debe contener mensajes.");
    const period = currentPeriod();

    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.tenantUsageEvent.findUnique({
        where: {
          tenantId_eventType_referenceId: {
            tenantId: input.tenantId,
            eventType: "CAMPAIGN_RESERVED",
            referenceId: input.campaignId,
          },
        },
      });
      if (existing) return;

      const policy = await tx.tenantCapacityPolicy.upsert({
        where: { tenantId: input.tenantId },
        create: this.policyCreate(input.tenantId),
        update: {},
      });
      if (input.messageCount > policy.maxCampaignContacts) {
        throw new HttpError(429, `La campaña supera el límite de ${policy.maxCampaignContacts} contactos.`);
      }

      const [activeCampaigns, pendingMessages, globalPendingMessages] = await Promise.all([
        tx.campaign.count({
          where: { tenantId: input.tenantId, status: { in: ["PREPARING", "RUNNING", "PAUSED", "PAUSED_BY_CIRCUIT_BREAKER"] } },
        }),
        tx.messageQueue.count({
          where: { tenantId: input.tenantId, status: { in: ["PENDING", "PROCESSING"] } },
        }),
        tx.messageQueue.count({ where: { status: { in: ["PENDING", "PROCESSING"] } } }),
      ]);

      if (activeCampaigns >= policy.maxConcurrentCampaigns) {
        throw new HttpError(429, `El tenant alcanzó ${policy.maxConcurrentCampaigns} campañas concurrentes.`);
      }
      if (pendingMessages + input.messageCount > policy.maxPendingMessages) {
        throw new HttpError(429, "La campaña excede el backlog permitido para este tenant.");
      }
      if (policy.backpressureEnabled && globalPendingMessages + input.messageCount > this.defaults.globalMaxPendingMessages) {
        throw new HttpError(503, "La plataforma está aplicando backpressure. Intenta nuevamente más tarde.");
      }

      await tx.tenantUsageMonthly.upsert({
        where: { tenantId_period: { tenantId: input.tenantId, period } },
        create: { tenantId: input.tenantId, period },
        update: {},
      });
      const remaining = policy.monthlyMessageLimit - input.messageCount;
      if (remaining < 0) throw new HttpError(429, "La campaña supera la cuota mensual del tenant.");
      const updated = await tx.tenantUsageMonthly.updateMany({
        where: {
          tenantId: input.tenantId,
          period,
          messagesReserved: { lte: remaining },
        },
        data: { messagesReserved: { increment: input.messageCount } },
      });
      if (updated.count !== 1) throw new HttpError(429, "La cuota mensual de mensajes fue alcanzada.");

      await tx.tenantUsageEvent.create({
        data: {
          tenantId: input.tenantId,
          period,
          eventType: "CAMPAIGN_RESERVED",
          referenceId: input.campaignId,
          units: input.messageCount,
        },
      });
    });
  }

  async releaseCampaignReservation(input: { tenantId: string; campaignId: string; messageCount: number }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const event = await tx.tenantUsageEvent.findUnique({
        where: {
          tenantId_eventType_referenceId: {
            tenantId: input.tenantId,
            eventType: "CAMPAIGN_RESERVED",
            referenceId: input.campaignId,
          },
        },
      });
      if (!event) return;
      await tx.tenantUsageMonthly.updateMany({
        where: { tenantId: input.tenantId, period: event.period },
        data: { messagesReserved: { decrement: Math.min(event.units, input.messageCount) } },
      });
      await tx.tenantUsageEvent.delete({ where: { id: event.id } });
    });
  }

  async recordMessageSent(input: { tenantId: string; queueItemId: string }): Promise<void> {
    const period = currentPeriod();
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.tenantUsageEvent.findUnique({
        where: {
          tenantId_eventType_referenceId: {
            tenantId: input.tenantId,
            eventType: "MESSAGE_SENT",
            referenceId: input.queueItemId,
          },
        },
      });
      if (existing) return;
      await tx.tenantUsageMonthly.upsert({
        where: { tenantId_period: { tenantId: input.tenantId, period } },
        create: { tenantId: input.tenantId, period, messagesSent: 1 },
        update: { messagesSent: { increment: 1 } },
      });
      await tx.tenantUsageEvent.create({
        data: {
          tenantId: input.tenantId,
          period,
          eventType: "MESSAGE_SENT",
          referenceId: input.queueItemId,
          units: 1,
        },
      });
    });
  }

  async getSnapshot(tenantId: string): Promise<TenantCapacitySnapshot> {
    const period = currentPeriod();
    const [policy, usage, sessions, activeCampaigns, pendingMessages, globalPendingMessages] = await Promise.all([
      this.prisma.tenantCapacityPolicy.upsert({
        where: { tenantId },
        create: this.policyCreate(tenantId),
        update: {},
      }),
      this.prisma.tenantUsageMonthly.findUnique({ where: { tenantId_period: { tenantId, period } } }),
      this.prisma.whatsAppSession.count({ where: { tenantId, status: { not: "DELETED" } } }),
      this.prisma.campaign.count({ where: { tenantId, status: { in: ["PREPARING", "RUNNING", "PAUSED", "PAUSED_BY_CIRCUIT_BREAKER"] } } }),
      this.prisma.messageQueue.count({ where: { tenantId, status: { in: ["PENDING", "PROCESSING"] } } }),
      this.prisma.messageQueue.count({ where: { status: { in: ["PENDING", "PROCESSING"] } } }),
    ]);
    return {
      tenantId,
      period,
      sessions,
      activeCampaigns,
      pendingMessages,
      globalPendingMessages,
      messagesReserved: usage?.messagesReserved ?? 0,
      messagesSent: usage?.messagesSent ?? 0,
      limits: {
        maxSessions: policy.maxSessions,
        maxConcurrentCampaigns: policy.maxConcurrentCampaigns,
        maxCampaignContacts: policy.maxCampaignContacts,
        maxPendingMessages: policy.maxPendingMessages,
        monthlyMessageLimit: policy.monthlyMessageLimit,
      },
    };
  }
}
