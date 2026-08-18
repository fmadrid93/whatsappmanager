-- Baseline v0.7.0 generated from prisma/schema.prisma.
-- Do not edit manually; update the schema and regenerate.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE "Tenant" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" VARCHAR(191) NOT NULL,
  "status" VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AppUser" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "email" VARCHAR(191) NOT NULL,
  "displayName" VARCHAR(191) NOT NULL,
  "passwordHash" VARCHAR(191) NOT NULL,
  "role" VARCHAR(191) NOT NULL DEFAULT 'TENANT_ADMIN',
  "status" VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AppUser_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WhatsAppSession" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "ownerUserId" UUID NOT NULL,
  "name" VARCHAR(191) NOT NULL,
  "phoneE164" VARCHAR(191),
  "whatsappJid" VARCHAR(191),
  "status" VARCHAR(191) NOT NULL DEFAULT 'NEW',
  "is_bot_active" BOOLEAN NOT NULL DEFAULT TRUE,
  "disconnectReason" VARCHAR(1000),
  "qrCode" TEXT,
  "qrUpdatedAt" TIMESTAMP(3),
  "lastHeartbeatAt" TIMESTAMP(3),
  "connectedAt" TIMESTAMP(3),
  "disconnectedAt" TIMESTAMP(3),
  "leaseOwner" VARCHAR(191),
  "leaseExpiresAt" TIMESTAMP(3),
  "revision" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WhatsAppSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BaileysCredential" (
  "sessionId" UUID NOT NULL,
  "payload" BYTEA NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BaileysCredential_pkey" PRIMARY KEY ("sessionId")
);

CREATE TABLE "BaileysAuthKey" (
  "sessionId" UUID NOT NULL,
  "category" VARCHAR(191) NOT NULL,
  "keyId" VARCHAR(191) NOT NULL,
  "payload" BYTEA NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BaileysAuthKey_pkey" PRIMARY KEY ("sessionId", "category", "keyId")
);

CREATE TABLE "BotFlow" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "name" VARCHAR(191) NOT NULL,
  "description" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "definitionPayload" BYTEA NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BotFlow_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BotFlowSession" (
  "flowId" UUID NOT NULL,
  "sessionId" UUID NOT NULL,
  "priority" INTEGER NOT NULL DEFAULT 100,
  "isEnabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BotFlowSession_pkey" PRIMARY KEY ("flowId", "sessionId")
);

CREATE TABLE "Conversation" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "sessionId" UUID NOT NULL,
  "flowId" UUID,
  "remoteJid" VARCHAR(191) NOT NULL,
  "phoneE164" VARCHAR(191),
  "is_bot_active" BOOLEAN NOT NULL DEFAULT TRUE,
  "humanModeSince" TIMESTAMP(3),
  "assignedAgentId" UUID,
  "lastInboundMessageId" VARCHAR(191),
  "lastOutboundMessageId" VARCHAR(191),
  "lastMessageAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Campaign" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "flowId" UUID,
  "mediaAssetId" UUID,
  "name" VARCHAR(191) NOT NULL,
  "status" VARCHAR(191) NOT NULL DEFAULT 'DRAFT',
  "messagePayload" BYTEA NOT NULL,
  "scheduledAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "pausedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "totalMessages" INTEGER NOT NULL DEFAULT 0,
  "sentMessages" INTEGER NOT NULL DEFAULT 0,
  "failedMessages" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CampaignSession" (
  "campaignId" UUID NOT NULL,
  "sessionId" UUID NOT NULL,
  "priority" INTEGER NOT NULL DEFAULT 100,
  "isEnabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CampaignSession_pkey" PRIMARY KEY ("campaignId", "sessionId")
);

CREATE TABLE "MediaAsset" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "fileName" VARCHAR(191) NOT NULL,
  "mimeType" VARCHAR(191) NOT NULL,
  "mediaKind" VARCHAR(191) NOT NULL,
  "sizeBytes" INTEGER,
  "sha256" VARCHAR(191),
  "sourceObjectKey" VARCHAR(1000),
  "status" VARCHAR(191) NOT NULL DEFAULT 'TEMPORARY',
  "sourceDeletedAt" TIMESTAMP(3),
  "cleanupError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MediaUpload" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "mediaAssetId" UUID NOT NULL,
  "sessionId" UUID NOT NULL,
  "mediaType" VARCHAR(191) NOT NULL,
  "protoPayload" BYTEA NOT NULL,
  "metadataPayload" BYTEA NOT NULL,
  "sourceMessageId" VARCHAR(191),
  "preparedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  "lastUsedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MediaUpload_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MediaPreparationJob" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "campaignId" UUID NOT NULL,
  "mediaAssetId" UUID NOT NULL,
  "sessionId" UUID NOT NULL,
  "status" VARCHAR(191) NOT NULL DEFAULT 'PENDING',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 5,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processingAt" TIMESTAMP(3),
  "preparedAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "lockedBy" VARCHAR(191),
  "lockExpiresAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MediaPreparationJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MessageQueue" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "campaignId" UUID NOT NULL,
  "assignedSessionId" UUID,
  "mediaAssetId" UUID,
  "contactName" VARCHAR(191),
  "recipientRaw" VARCHAR(1000) NOT NULL,
  "recipientE164" VARCHAR(191),
  "recipientJid" VARCHAR(191),
  "messageType" VARCHAR(191) NOT NULL,
  "payload" BYTEA,
  "status" VARCHAR(191) NOT NULL DEFAULT 'PENDING',
  "priority" INTEGER NOT NULL DEFAULT 100,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 5,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processingAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "lockedBy" VARCHAR(191),
  "lockExpiresAt" TIMESTAMP(3),
  "idempotencyKey" VARCHAR(191) NOT NULL,
  "clientMessageId" VARCHAR(191),
  "sentMessageId" VARCHAR(191),
  "lastErrorCode" VARCHAR(191),
  "lastErrorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MessageQueue_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WhatsAppMessage" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "sessionId" UUID NOT NULL,
  "conversationId" UUID,
  "campaignId" UUID,
  "queueItemId" UUID,
  "whatsappMessageId" VARCHAR(191) NOT NULL,
  "remoteJid" VARCHAR(191) NOT NULL,
  "participantJid" VARCHAR(191),
  "direction" VARCHAR(191) NOT NULL,
  "messageType" VARCHAR(191) NOT NULL,
  "status" VARCHAR(191) NOT NULL DEFAULT 'RECEIVED',
  "fromMe" BOOLEAN NOT NULL DEFAULT FALSE,
  "payload" BYTEA NOT NULL,
  "messageTimestamp" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WhatsAppMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MessageReceipt" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "messageId" UUID NOT NULL,
  "receiptType" VARCHAR(191) NOT NULL,
  "participantJid" VARCHAR(191),
  "receiptAt" TIMESTAMP(3) NOT NULL,
  "payload" BYTEA,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MessageReceipt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProcessedInboundEvent" (
  "tenantId" UUID NOT NULL,
  "sessionId" UUID NOT NULL,
  "whatsappMessageId" VARCHAR(191) NOT NULL,
  "responseMessageId" VARCHAR(191),
  "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProcessedInboundEvent_pkey" PRIMARY KEY ("sessionId", "whatsappMessageId")
);

CREATE TABLE "MessageAttempt" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "queueItemId" UUID NOT NULL,
  "campaignId" UUID NOT NULL,
  "sessionId" UUID NOT NULL,
  "clientMessageId" VARCHAR(191) NOT NULL,
  "whatsappMessageId" VARCHAR(191),
  "state" VARCHAR(191) NOT NULL DEFAULT 'STARTED',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "submittedAt" TIMESTAMP(3),
  "acknowledgedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "reconcileAfter" TIMESTAMP(3),
  "errorCode" VARCHAR(191),
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MessageAttempt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DeadLetterMessage" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "queueItemId" UUID NOT NULL,
  "campaignId" UUID NOT NULL,
  "sessionId" UUID,
  "recipientE164" VARCHAR(191),
  "reasonCode" VARCHAR(191) NOT NULL,
  "reasonMessage" TEXT NOT NULL,
  "payload" BYTEA,
  "attemptCount" INTEGER NOT NULL,
  "failedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  "resolution" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DeadLetterMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RefreshSession" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "familyId" UUID NOT NULL,
  "tokenHash" VARCHAR(191) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "replacedById" UUID,
  "ipAddress" VARCHAR(191),
  "userAgent" VARCHAR(1000),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RefreshSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditLog" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "actorUserId" UUID,
  "action" VARCHAR(191) NOT NULL,
  "entityType" VARCHAR(191) NOT NULL,
  "entityId" VARCHAR(191),
  "result" VARCHAR(191) NOT NULL DEFAULT 'SUCCESS',
  "requestId" VARCHAR(191),
  "ipAddress" VARCHAR(191),
  "userAgent" VARCHAR(1000),
  "metadataPayload" BYTEA,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Tenant_status_idx" ON "Tenant" ("status");

CREATE UNIQUE INDEX "AppUser_email_key" ON "AppUser" ("email");
CREATE INDEX "AppUser_tenantId_status_idx" ON "AppUser" ("tenantId", "status");

CREATE UNIQUE INDEX "WhatsAppSession_tenantId_name_key" ON "WhatsAppSession" ("tenantId", "name");
CREATE INDEX "WhatsAppSession_tenantId_ownerUserId_status_isBotActive_idx" ON "WhatsAppSession" ("tenantId", "ownerUserId", "status", "is_bot_active");
CREATE INDEX "WhatsAppSession_leaseExpiresAt_idx" ON "WhatsAppSession" ("leaseExpiresAt");

CREATE INDEX "BaileysAuthKey_sessionId_category_idx" ON "BaileysAuthKey" ("sessionId", "category");

CREATE UNIQUE INDEX "BotFlow_tenantId_name_version_key" ON "BotFlow" ("tenantId", "name", "version");
CREATE INDEX "BotFlow_tenantId_isActive_idx" ON "BotFlow" ("tenantId", "isActive");

CREATE INDEX "BotFlowSession_sessionId_isEnabled_idx" ON "BotFlowSession" ("sessionId", "isEnabled");

CREATE UNIQUE INDEX "Conversation_sessionId_remoteJid_key" ON "Conversation" ("sessionId", "remoteJid");
CREATE INDEX "Conversation_tenantId_isBotActive_lastMessageAt_idx" ON "Conversation" ("tenantId", "is_bot_active", "lastMessageAt");
CREATE INDEX "Conversation_assignedAgentId_idx" ON "Conversation" ("assignedAgentId");

CREATE INDEX "Campaign_tenantId_status_scheduledAt_idx" ON "Campaign" ("tenantId", "status", "scheduledAt");

CREATE INDEX "CampaignSession_sessionId_isEnabled_idx" ON "CampaignSession" ("sessionId", "isEnabled");

CREATE INDEX "MediaAsset_tenantId_status_idx" ON "MediaAsset" ("tenantId", "status");
CREATE INDEX "MediaAsset_sha256_idx" ON "MediaAsset" ("sha256");

CREATE UNIQUE INDEX "MediaUpload_mediaAssetId_sessionId_key" ON "MediaUpload" ("mediaAssetId", "sessionId");
CREATE INDEX "MediaUpload_sessionId_expiresAt_idx" ON "MediaUpload" ("sessionId", "expiresAt");

CREATE UNIQUE INDEX "MediaPreparationJob_campaignId_sessionId_key" ON "MediaPreparationJob" ("campaignId", "sessionId");
CREATE INDEX "MediaPreparationJob_sessionId_status_availableAt_idx" ON "MediaPreparationJob" ("sessionId", "status", "availableAt");
CREATE INDEX "MediaPreparationJob_campaignId_status_idx" ON "MediaPreparationJob" ("campaignId", "status");
CREATE INDEX "MediaPreparationJob_lockExpiresAt_idx" ON "MediaPreparationJob" ("lockExpiresAt");

CREATE UNIQUE INDEX "MessageQueue_tenantId_idempotencyKey_key" ON "MessageQueue" ("tenantId", "idempotencyKey");
CREATE INDEX "MessageQueue_status_availableAt_priority_idx" ON "MessageQueue" ("status", "availableAt", "priority");
CREATE INDEX "MessageQueue_assignedSessionId_status_availableAt_idx" ON "MessageQueue" ("assignedSessionId", "status", "availableAt");
CREATE INDEX "MessageQueue_campaignId_status_idx" ON "MessageQueue" ("campaignId", "status");
CREATE INDEX "MessageQueue_lockExpiresAt_idx" ON "MessageQueue" ("lockExpiresAt");

CREATE UNIQUE INDEX "WhatsAppMessage_sessionId_whatsappMessageId_key" ON "WhatsAppMessage" ("sessionId", "whatsappMessageId");
CREATE INDEX "WhatsAppMessage_tenantId_remoteJid_messageTimestamp_idx" ON "WhatsAppMessage" ("tenantId", "remoteJid", "messageTimestamp");
CREATE INDEX "WhatsAppMessage_conversationId_messageTimestamp_idx" ON "WhatsAppMessage" ("conversationId", "messageTimestamp");
CREATE INDEX "WhatsAppMessage_queueItemId_idx" ON "WhatsAppMessage" ("queueItemId");
CREATE INDEX "WhatsAppMessage_status_updatedAt_idx" ON "WhatsAppMessage" ("status", "updatedAt");

CREATE INDEX "MessageReceipt_messageId_receiptAt_idx" ON "MessageReceipt" ("messageId", "receiptAt");
CREATE INDEX "MessageReceipt_receiptType_receiptAt_idx" ON "MessageReceipt" ("receiptType", "receiptAt");

CREATE INDEX "ProcessedInboundEvent_tenantId_processedAt_idx" ON "ProcessedInboundEvent" ("tenantId", "processedAt");

CREATE UNIQUE INDEX "MessageAttempt_sessionId_clientMessageId_key" ON "MessageAttempt" ("sessionId", "clientMessageId");
CREATE INDEX "MessageAttempt_queueItemId_state_idx" ON "MessageAttempt" ("queueItemId", "state");
CREATE INDEX "MessageAttempt_state_reconcileAfter_idx" ON "MessageAttempt" ("state", "reconcileAfter");
CREATE INDEX "MessageAttempt_campaignId_state_idx" ON "MessageAttempt" ("campaignId", "state");

CREATE UNIQUE INDEX "DeadLetterMessage_queueItemId_key" ON "DeadLetterMessage" ("queueItemId");
CREATE INDEX "DeadLetterMessage_tenantId_failedAt_idx" ON "DeadLetterMessage" ("tenantId", "failedAt");
CREATE INDEX "DeadLetterMessage_campaignId_resolvedAt_idx" ON "DeadLetterMessage" ("campaignId", "resolvedAt");

CREATE UNIQUE INDEX "RefreshSession_tokenHash_key" ON "RefreshSession" ("tokenHash");
CREATE INDEX "RefreshSession_userId_revokedAt_expiresAt_idx" ON "RefreshSession" ("userId", "revokedAt", "expiresAt");
CREATE INDEX "RefreshSession_familyId_idx" ON "RefreshSession" ("familyId");
CREATE INDEX "RefreshSession_tenantId_createdAt_idx" ON "RefreshSession" ("tenantId", "createdAt");

CREATE INDEX "AuditLog_tenantId_createdAt_idx" ON "AuditLog" ("tenantId", "createdAt");
CREATE INDEX "AuditLog_actorUserId_createdAt_idx" ON "AuditLog" ("actorUserId", "createdAt");
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog" ("entityType", "entityId");
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog" ("action", "createdAt");

ALTER TABLE "AppUser" ADD CONSTRAINT "AppUser_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "WhatsAppSession" ADD CONSTRAINT "WhatsAppSession_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "WhatsAppSession" ADD CONSTRAINT "WhatsAppSession_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "AppUser" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "BaileysCredential" ADD CONSTRAINT "BaileysCredential_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WhatsAppSession" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "BaileysAuthKey" ADD CONSTRAINT "BaileysAuthKey_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WhatsAppSession" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "BotFlow" ADD CONSTRAINT "BotFlow_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "BotFlowSession" ADD CONSTRAINT "BotFlowSession_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "BotFlow" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "BotFlowSession" ADD CONSTRAINT "BotFlowSession_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WhatsAppSession" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WhatsAppSession" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "BotFlow" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_assignedAgentId_fkey" FOREIGN KEY ("assignedAgentId") REFERENCES "AppUser" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "BotFlow" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "CampaignSession" ADD CONSTRAINT "CampaignSession_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "CampaignSession" ADD CONSTRAINT "CampaignSession_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WhatsAppSession" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "MediaUpload" ADD CONSTRAINT "MediaUpload_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "MediaUpload" ADD CONSTRAINT "MediaUpload_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WhatsAppSession" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "MediaPreparationJob" ADD CONSTRAINT "MediaPreparationJob_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "MediaPreparationJob" ADD CONSTRAINT "MediaPreparationJob_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "MediaPreparationJob" ADD CONSTRAINT "MediaPreparationJob_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "MediaPreparationJob" ADD CONSTRAINT "MediaPreparationJob_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WhatsAppSession" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "MessageQueue" ADD CONSTRAINT "MessageQueue_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "MessageQueue" ADD CONSTRAINT "MessageQueue_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "MessageQueue" ADD CONSTRAINT "MessageQueue_assignedSessionId_fkey" FOREIGN KEY ("assignedSessionId") REFERENCES "WhatsAppSession" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "MessageQueue" ADD CONSTRAINT "MessageQueue_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "WhatsAppMessage" ADD CONSTRAINT "WhatsAppMessage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "WhatsAppMessage" ADD CONSTRAINT "WhatsAppMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WhatsAppSession" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "WhatsAppMessage" ADD CONSTRAINT "WhatsAppMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "WhatsAppMessage" ADD CONSTRAINT "WhatsAppMessage_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "WhatsAppMessage" ADD CONSTRAINT "WhatsAppMessage_queueItemId_fkey" FOREIGN KEY ("queueItemId") REFERENCES "MessageQueue" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "MessageReceipt" ADD CONSTRAINT "MessageReceipt_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "WhatsAppMessage" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "ProcessedInboundEvent" ADD CONSTRAINT "ProcessedInboundEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "ProcessedInboundEvent" ADD CONSTRAINT "ProcessedInboundEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WhatsAppSession" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "MessageAttempt" ADD CONSTRAINT "MessageAttempt_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "MessageAttempt" ADD CONSTRAINT "MessageAttempt_queueItemId_fkey" FOREIGN KEY ("queueItemId") REFERENCES "MessageQueue" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "MessageAttempt" ADD CONSTRAINT "MessageAttempt_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "MessageAttempt" ADD CONSTRAINT "MessageAttempt_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WhatsAppSession" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "DeadLetterMessage" ADD CONSTRAINT "DeadLetterMessage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "DeadLetterMessage" ADD CONSTRAINT "DeadLetterMessage_queueItemId_fkey" FOREIGN KEY ("queueItemId") REFERENCES "MessageQueue" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "DeadLetterMessage" ADD CONSTRAINT "DeadLetterMessage_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "DeadLetterMessage" ADD CONSTRAINT "DeadLetterMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WhatsAppSession" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "RefreshSession" ADD CONSTRAINT "RefreshSession_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "RefreshSession" ADD CONSTRAINT "RefreshSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AppUser" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "AppUser" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
