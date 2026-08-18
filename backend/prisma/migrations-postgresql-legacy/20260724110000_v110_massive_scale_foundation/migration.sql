-- v1.1.0-alpha: Massive Scale Foundation
-- Adds deterministic session sharding, tenant quotas, usage ledger,
-- transactional outbox and worker-node membership.

ALTER TABLE "WhatsAppSession"
  ADD COLUMN "shardKey" INTEGER NOT NULL DEFAULT 0;

UPDATE "WhatsAppSession"
SET "shardKey" = (hashtextextended(id::text, 0) & 2147483647)::integer;

CREATE INDEX "WhatsAppSession_shardKey_status_leaseExpiresAt_idx"
  ON "WhatsAppSession"("shardKey", "status", "leaseExpiresAt");

CREATE TABLE "TenantCapacityPolicy" (
  "tenantId" UUID NOT NULL,
  "maxSessions" INTEGER NOT NULL DEFAULT 5,
  "maxConcurrentCampaigns" INTEGER NOT NULL DEFAULT 3,
  "maxCampaignContacts" INTEGER NOT NULL DEFAULT 50000,
  "maxPendingMessages" INTEGER NOT NULL DEFAULT 100000,
  "monthlyMessageLimit" INTEGER NOT NULL DEFAULT 1000000,
  "backpressureEnabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TenantCapacityPolicy_pkey" PRIMARY KEY ("tenantId")
);

CREATE TABLE "TenantUsageMonthly" (
  "tenantId" UUID NOT NULL,
  "period" VARCHAR(191) NOT NULL,
  "messagesReserved" INTEGER NOT NULL DEFAULT 0,
  "messagesSent" INTEGER NOT NULL DEFAULT 0,
  "messagesFailed" INTEGER NOT NULL DEFAULT 0,
  "mediaBytesUploaded" BIGINT NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TenantUsageMonthly_pkey" PRIMARY KEY ("tenantId", "period")
);

CREATE INDEX "TenantUsageMonthly_period_messagesSent_idx"
  ON "TenantUsageMonthly"("period", "messagesSent");

CREATE TABLE "TenantUsageEvent" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "period" VARCHAR(191) NOT NULL,
  "eventType" VARCHAR(191) NOT NULL,
  "referenceId" VARCHAR(191) NOT NULL,
  "units" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TenantUsageEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TenantUsageEvent_tenantId_eventType_referenceId_key"
  ON "TenantUsageEvent"("tenantId", "eventType", "referenceId");
CREATE INDEX "TenantUsageEvent_tenantId_period_eventType_idx"
  ON "TenantUsageEvent"("tenantId", "period", "eventType");

CREATE TABLE "OutboxEvent" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID,
  "aggregateType" VARCHAR(191) NOT NULL,
  "aggregateId" VARCHAR(191) NOT NULL,
  "eventType" VARCHAR(191) NOT NULL,
  "payload" BYTEA NOT NULL,
  "status" VARCHAR(191) NOT NULL DEFAULT 'PENDING',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 12,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedBy" VARCHAR(191),
  "lockExpiresAt" TIMESTAMP(3),
  "publishedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OutboxEvent_status_availableAt_createdAt_idx"
  ON "OutboxEvent"("status", "availableAt", "createdAt");
CREATE INDEX "OutboxEvent_tenantId_createdAt_idx"
  ON "OutboxEvent"("tenantId", "createdAt");
CREATE INDEX "OutboxEvent_lockExpiresAt_idx"
  ON "OutboxEvent"("lockExpiresAt");

CREATE TABLE "WorkerNode" (
  "id" VARCHAR(191) NOT NULL,
  "shardId" INTEGER NOT NULL,
  "shardCount" INTEGER NOT NULL,
  "status" VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
  "lastHeartbeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseExpiresAt" TIMESTAMP(3) NOT NULL,
  "metadata" BYTEA,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkerNode_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WorkerNode_status_leaseExpiresAt_idx"
  ON "WorkerNode"("status", "leaseExpiresAt");
CREATE INDEX "WorkerNode_shardId_shardCount_idx"
  ON "WorkerNode"("shardId", "shardCount");

ALTER TABLE "TenantCapacityPolicy"
  ADD CONSTRAINT "TenantCapacityPolicy_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "TenantUsageMonthly"
  ADD CONSTRAINT "TenantUsageMonthly_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "TenantUsageEvent"
  ADD CONSTRAINT "TenantUsageEvent_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "OutboxEvent"
  ADD CONSTRAINT "OutboxEvent_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE NO ACTION ON UPDATE NO ACTION;

INSERT INTO "TenantCapacityPolicy" (
  "tenantId", "maxSessions", "maxConcurrentCampaigns",
  "maxCampaignContacts", "maxPendingMessages", "monthlyMessageLimit",
  "backpressureEnabled", "createdAt", "updatedAt"
)
SELECT id, 5, 3, 50000, 100000, 1000000, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Tenant"
ON CONFLICT ("tenantId") DO NOTHING;
