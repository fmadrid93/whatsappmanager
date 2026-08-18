BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[Tenant] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [name] NVARCHAR(191) NOT NULL,
    [status] NVARCHAR(191) NOT NULL CONSTRAINT [Tenant_status_df] DEFAULT 'ACTIVE',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Tenant_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Tenant_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[AppUser] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [email] NVARCHAR(191) NOT NULL,
    [displayName] NVARCHAR(191) NOT NULL,
    [passwordHash] NVARCHAR(191) NOT NULL,
    [role] NVARCHAR(191) NOT NULL CONSTRAINT [AppUser_role_df] DEFAULT 'TENANT_ADMIN',
    [status] NVARCHAR(191) NOT NULL CONSTRAINT [AppUser_status_df] DEFAULT 'ACTIVE',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [AppUser_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [AppUser_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [AppUser_email_key] UNIQUE NONCLUSTERED ([email])
);

-- CreateTable
CREATE TABLE [dbo].[WhatsAppSession] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [ownerUserId] UNIQUEIDENTIFIER NOT NULL,
    [name] NVARCHAR(191) NOT NULL,
    [phoneE164] NVARCHAR(191),
    [whatsappJid] NVARCHAR(191),
    [status] NVARCHAR(191) NOT NULL CONSTRAINT [WhatsAppSession_status_df] DEFAULT 'NEW',
    [is_bot_active] BIT NOT NULL CONSTRAINT [WhatsAppSession_is_bot_active_df] DEFAULT 1,
    [disconnectReason] NVARCHAR(1000),
    [qrCode] NVARCHAR(max),
    [qrUpdatedAt] DATETIME2,
    [lastHeartbeatAt] DATETIME2,
    [connectedAt] DATETIME2,
    [disconnectedAt] DATETIME2,
    [leaseOwner] NVARCHAR(191),
    [leaseExpiresAt] DATETIME2,
    [revision] INT NOT NULL CONSTRAINT [WhatsAppSession_revision_df] DEFAULT 0,
    [shardKey] INT NOT NULL CONSTRAINT [WhatsAppSession_shardKey_df] DEFAULT 0,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [WhatsAppSession_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [WhatsAppSession_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [WhatsAppSession_tenantId_name_key] UNIQUE NONCLUSTERED ([tenantId],[name])
);

-- CreateTable
CREATE TABLE [dbo].[BaileysCredential] (
    [sessionId] UNIQUEIDENTIFIER NOT NULL,
    [payload] VARBINARY(max) NOT NULL,
    [revision] INT NOT NULL CONSTRAINT [BaileysCredential_revision_df] DEFAULT 0,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [BaileysCredential_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [BaileysCredential_pkey] PRIMARY KEY CLUSTERED ([sessionId])
);

-- CreateTable
CREATE TABLE [dbo].[BaileysAuthKey] (
    [sessionId] UNIQUEIDENTIFIER NOT NULL,
    [category] NVARCHAR(191) NOT NULL,
    [keyId] NVARCHAR(191) NOT NULL,
    [payload] VARBINARY(max) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [BaileysAuthKey_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [BaileysAuthKey_pkey] PRIMARY KEY CLUSTERED ([sessionId],[category],[keyId])
);

-- CreateTable
CREATE TABLE [dbo].[BotFlow] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [name] NVARCHAR(191) NOT NULL,
    [description] NVARCHAR(max),
    [version] INT NOT NULL CONSTRAINT [BotFlow_version_df] DEFAULT 1,
    [isActive] BIT NOT NULL CONSTRAINT [BotFlow_isActive_df] DEFAULT 1,
    [definitionPayload] VARBINARY(max) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [BotFlow_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [BotFlow_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [BotFlow_tenantId_name_version_key] UNIQUE NONCLUSTERED ([tenantId],[name],[version])
);

-- CreateTable
CREATE TABLE [dbo].[BotFlowSession] (
    [flowId] UNIQUEIDENTIFIER NOT NULL,
    [sessionId] UNIQUEIDENTIFIER NOT NULL,
    [priority] INT NOT NULL CONSTRAINT [BotFlowSession_priority_df] DEFAULT 100,
    [isEnabled] BIT NOT NULL CONSTRAINT [BotFlowSession_isEnabled_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [BotFlowSession_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [BotFlowSession_pkey] PRIMARY KEY CLUSTERED ([flowId],[sessionId])
);

-- CreateTable
CREATE TABLE [dbo].[Conversation] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [sessionId] UNIQUEIDENTIFIER NOT NULL,
    [flowId] UNIQUEIDENTIFIER,
    [remoteJid] NVARCHAR(191) NOT NULL,
    [phoneE164] NVARCHAR(191),
    [is_bot_active] BIT NOT NULL CONSTRAINT [Conversation_is_bot_active_df] DEFAULT 1,
    [humanModeSince] DATETIME2,
    [assignedAgentId] UNIQUEIDENTIFIER,
    [lastInboundMessageId] NVARCHAR(191),
    [lastOutboundMessageId] NVARCHAR(191),
    [lastMessageAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Conversation_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Conversation_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Conversation_sessionId_remoteJid_key] UNIQUE NONCLUSTERED ([sessionId],[remoteJid])
);

-- CreateTable
CREATE TABLE [dbo].[Campaign] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [flowId] UNIQUEIDENTIFIER,
    [mediaAssetId] UNIQUEIDENTIFIER,
    [name] NVARCHAR(191) NOT NULL,
    [status] NVARCHAR(191) NOT NULL CONSTRAINT [Campaign_status_df] DEFAULT 'DRAFT',
    [messagePayload] VARBINARY(max) NOT NULL,
    [scheduledAt] DATETIME2,
    [startedAt] DATETIME2,
    [completedAt] DATETIME2,
    [pausedAt] DATETIME2,
    [cancelledAt] DATETIME2,
    [totalMessages] INT NOT NULL CONSTRAINT [Campaign_totalMessages_df] DEFAULT 0,
    [sentMessages] INT NOT NULL CONSTRAINT [Campaign_sentMessages_df] DEFAULT 0,
    [failedMessages] INT NOT NULL CONSTRAINT [Campaign_failedMessages_df] DEFAULT 0,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Campaign_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Campaign_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[CampaignSession] (
    [campaignId] UNIQUEIDENTIFIER NOT NULL,
    [sessionId] UNIQUEIDENTIFIER NOT NULL,
    [priority] INT NOT NULL CONSTRAINT [CampaignSession_priority_df] DEFAULT 100,
    [isEnabled] BIT NOT NULL CONSTRAINT [CampaignSession_isEnabled_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [CampaignSession_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [CampaignSession_pkey] PRIMARY KEY CLUSTERED ([campaignId],[sessionId])
);

-- CreateTable
CREATE TABLE [dbo].[MediaAsset] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [fileName] NVARCHAR(191) NOT NULL,
    [mimeType] NVARCHAR(191) NOT NULL,
    [mediaKind] NVARCHAR(191) NOT NULL,
    [sizeBytes] INT,
    [sha256] NVARCHAR(191),
    [sourceObjectKey] NVARCHAR(1000),
    [status] NVARCHAR(191) NOT NULL CONSTRAINT [MediaAsset_status_df] DEFAULT 'TEMPORARY',
    [sourceDeletedAt] DATETIME2,
    [cleanupError] NVARCHAR(max),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [MediaAsset_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [MediaAsset_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[MediaUpload] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [mediaAssetId] UNIQUEIDENTIFIER NOT NULL,
    [sessionId] UNIQUEIDENTIFIER NOT NULL,
    [mediaType] NVARCHAR(191) NOT NULL,
    [protoPayload] VARBINARY(max) NOT NULL,
    [metadataPayload] VARBINARY(max) NOT NULL,
    [sourceMessageId] NVARCHAR(191),
    [preparedAt] DATETIME2 NOT NULL CONSTRAINT [MediaUpload_preparedAt_df] DEFAULT CURRENT_TIMESTAMP,
    [expiresAt] DATETIME2,
    [lastUsedAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [MediaUpload_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [MediaUpload_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [MediaUpload_mediaAssetId_sessionId_key] UNIQUE NONCLUSTERED ([mediaAssetId],[sessionId])
);

-- CreateTable
CREATE TABLE [dbo].[MediaPreparationJob] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [campaignId] UNIQUEIDENTIFIER NOT NULL,
    [mediaAssetId] UNIQUEIDENTIFIER NOT NULL,
    [sessionId] UNIQUEIDENTIFIER NOT NULL,
    [status] NVARCHAR(191) NOT NULL CONSTRAINT [MediaPreparationJob_status_df] DEFAULT 'PENDING',
    [attemptCount] INT NOT NULL CONSTRAINT [MediaPreparationJob_attemptCount_df] DEFAULT 0,
    [maxAttempts] INT NOT NULL CONSTRAINT [MediaPreparationJob_maxAttempts_df] DEFAULT 5,
    [availableAt] DATETIME2 NOT NULL CONSTRAINT [MediaPreparationJob_availableAt_df] DEFAULT CURRENT_TIMESTAMP,
    [processingAt] DATETIME2,
    [preparedAt] DATETIME2,
    [failedAt] DATETIME2,
    [lockedBy] NVARCHAR(191),
    [lockExpiresAt] DATETIME2,
    [lastError] NVARCHAR(max),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [MediaPreparationJob_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [MediaPreparationJob_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [MediaPreparationJob_campaignId_sessionId_key] UNIQUE NONCLUSTERED ([campaignId],[sessionId])
);

-- CreateTable
CREATE TABLE [dbo].[MessageQueue] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [campaignId] UNIQUEIDENTIFIER NOT NULL,
    [assignedSessionId] UNIQUEIDENTIFIER,
    [mediaAssetId] UNIQUEIDENTIFIER,
    [contactName] NVARCHAR(191),
    [recipientRaw] NVARCHAR(1000) NOT NULL,
    [recipientE164] NVARCHAR(191),
    [recipientJid] NVARCHAR(191),
    [messageType] NVARCHAR(191) NOT NULL,
    [payload] VARBINARY(max),
    [status] NVARCHAR(191) NOT NULL CONSTRAINT [MessageQueue_status_df] DEFAULT 'PENDING',
    [priority] INT NOT NULL CONSTRAINT [MessageQueue_priority_df] DEFAULT 100,
    [attemptCount] INT NOT NULL CONSTRAINT [MessageQueue_attemptCount_df] DEFAULT 0,
    [maxAttempts] INT NOT NULL CONSTRAINT [MessageQueue_maxAttempts_df] DEFAULT 5,
    [availableAt] DATETIME2 NOT NULL CONSTRAINT [MessageQueue_availableAt_df] DEFAULT CURRENT_TIMESTAMP,
    [processingAt] DATETIME2,
    [sentAt] DATETIME2,
    [failedAt] DATETIME2,
    [lockedBy] NVARCHAR(191),
    [lockExpiresAt] DATETIME2,
    [idempotencyKey] NVARCHAR(191) NOT NULL,
    [clientMessageId] NVARCHAR(191),
    [sentMessageId] NVARCHAR(191),
    [lastErrorCode] NVARCHAR(191),
    [lastErrorMessage] NVARCHAR(max),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [MessageQueue_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [MessageQueue_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [MessageQueue_tenantId_idempotencyKey_key] UNIQUE NONCLUSTERED ([tenantId],[idempotencyKey])
);

-- CreateTable
CREATE TABLE [dbo].[WhatsAppMessage] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [sessionId] UNIQUEIDENTIFIER NOT NULL,
    [conversationId] UNIQUEIDENTIFIER,
    [campaignId] UNIQUEIDENTIFIER,
    [queueItemId] UNIQUEIDENTIFIER,
    [whatsappMessageId] NVARCHAR(191) NOT NULL,
    [remoteJid] NVARCHAR(191) NOT NULL,
    [participantJid] NVARCHAR(191),
    [direction] NVARCHAR(191) NOT NULL,
    [messageType] NVARCHAR(191) NOT NULL,
    [status] NVARCHAR(191) NOT NULL CONSTRAINT [WhatsAppMessage_status_df] DEFAULT 'RECEIVED',
    [fromMe] BIT NOT NULL CONSTRAINT [WhatsAppMessage_fromMe_df] DEFAULT 0,
    [payload] VARBINARY(max) NOT NULL,
    [messageTimestamp] DATETIME2 NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [WhatsAppMessage_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [WhatsAppMessage_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [WhatsAppMessage_sessionId_whatsappMessageId_key] UNIQUE NONCLUSTERED ([sessionId],[whatsappMessageId])
);

-- CreateTable
CREATE TABLE [dbo].[MessageReceipt] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [messageId] UNIQUEIDENTIFIER NOT NULL,
    [receiptType] NVARCHAR(191) NOT NULL,
    [participantJid] NVARCHAR(191),
    [receiptAt] DATETIME2 NOT NULL,
    [payload] VARBINARY(max),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [MessageReceipt_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [MessageReceipt_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[ProcessedInboundEvent] (
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [sessionId] UNIQUEIDENTIFIER NOT NULL,
    [whatsappMessageId] NVARCHAR(191) NOT NULL,
    [responseMessageId] NVARCHAR(191),
    [processedAt] DATETIME2 NOT NULL CONSTRAINT [ProcessedInboundEvent_processedAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [ProcessedInboundEvent_pkey] PRIMARY KEY CLUSTERED ([sessionId],[whatsappMessageId])
);

-- CreateTable
CREATE TABLE [dbo].[MessageAttempt] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [queueItemId] UNIQUEIDENTIFIER NOT NULL,
    [campaignId] UNIQUEIDENTIFIER NOT NULL,
    [sessionId] UNIQUEIDENTIFIER NOT NULL,
    [clientMessageId] NVARCHAR(191) NOT NULL,
    [whatsappMessageId] NVARCHAR(191),
    [state] NVARCHAR(191) NOT NULL CONSTRAINT [MessageAttempt_state_df] DEFAULT 'STARTED',
    [startedAt] DATETIME2 NOT NULL CONSTRAINT [MessageAttempt_startedAt_df] DEFAULT CURRENT_TIMESTAMP,
    [submittedAt] DATETIME2,
    [acknowledgedAt] DATETIME2,
    [completedAt] DATETIME2,
    [failedAt] DATETIME2,
    [reconcileAfter] DATETIME2,
    [errorCode] NVARCHAR(191),
    [errorMessage] NVARCHAR(max),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [MessageAttempt_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [MessageAttempt_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [MessageAttempt_sessionId_clientMessageId_key] UNIQUE NONCLUSTERED ([sessionId],[clientMessageId])
);

-- CreateTable
CREATE TABLE [dbo].[DeadLetterMessage] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [queueItemId] UNIQUEIDENTIFIER NOT NULL,
    [campaignId] UNIQUEIDENTIFIER NOT NULL,
    [sessionId] UNIQUEIDENTIFIER,
    [recipientE164] NVARCHAR(191),
    [reasonCode] NVARCHAR(191) NOT NULL,
    [reasonMessage] NVARCHAR(max) NOT NULL,
    [payload] VARBINARY(max),
    [attemptCount] INT NOT NULL,
    [failedAt] DATETIME2 NOT NULL CONSTRAINT [DeadLetterMessage_failedAt_df] DEFAULT CURRENT_TIMESTAMP,
    [resolvedAt] DATETIME2,
    [resolution] NVARCHAR(max),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [DeadLetterMessage_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [DeadLetterMessage_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [DeadLetterMessage_queueItemId_key] UNIQUE NONCLUSTERED ([queueItemId])
);

-- CreateTable
CREATE TABLE [dbo].[RefreshSession] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [userId] UNIQUEIDENTIFIER NOT NULL,
    [familyId] UNIQUEIDENTIFIER NOT NULL,
    [tokenHash] NVARCHAR(191) NOT NULL,
    [expiresAt] DATETIME2 NOT NULL,
    [revokedAt] DATETIME2,
    [replacedById] UNIQUEIDENTIFIER,
    [ipAddress] NVARCHAR(191),
    [userAgent] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [RefreshSession_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [RefreshSession_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [RefreshSession_tokenHash_key] UNIQUE NONCLUSTERED ([tokenHash])
);

-- CreateTable
CREATE TABLE [dbo].[AuditLog] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [actorUserId] UNIQUEIDENTIFIER,
    [action] NVARCHAR(191) NOT NULL,
    [entityType] NVARCHAR(191) NOT NULL,
    [entityId] NVARCHAR(191),
    [result] NVARCHAR(191) NOT NULL CONSTRAINT [AuditLog_result_df] DEFAULT 'SUCCESS',
    [requestId] NVARCHAR(191),
    [ipAddress] NVARCHAR(191),
    [userAgent] NVARCHAR(1000),
    [metadataPayload] VARBINARY(max),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [AuditLog_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [AuditLog_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[RateLimitBucket] (
    [key] NVARCHAR(191) NOT NULL,
    [count] INT NOT NULL CONSTRAINT [RateLimitBucket_count_df] DEFAULT 0,
    [resetAt] DATETIME2 NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [RateLimitBucket_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [RateLimitBucket_pkey] PRIMARY KEY CLUSTERED ([key])
);

-- CreateTable
CREATE TABLE [dbo].[TenantCapacityPolicy] (
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [maxSessions] INT NOT NULL CONSTRAINT [TenantCapacityPolicy_maxSessions_df] DEFAULT 5,
    [maxConcurrentCampaigns] INT NOT NULL CONSTRAINT [TenantCapacityPolicy_maxConcurrentCampaigns_df] DEFAULT 3,
    [maxCampaignContacts] INT NOT NULL CONSTRAINT [TenantCapacityPolicy_maxCampaignContacts_df] DEFAULT 50000,
    [maxPendingMessages] INT NOT NULL CONSTRAINT [TenantCapacityPolicy_maxPendingMessages_df] DEFAULT 100000,
    [monthlyMessageLimit] INT NOT NULL CONSTRAINT [TenantCapacityPolicy_monthlyMessageLimit_df] DEFAULT 1000000,
    [backpressureEnabled] BIT NOT NULL CONSTRAINT [TenantCapacityPolicy_backpressureEnabled_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [TenantCapacityPolicy_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [TenantCapacityPolicy_pkey] PRIMARY KEY CLUSTERED ([tenantId])
);

-- CreateTable
CREATE TABLE [dbo].[TenantUsageMonthly] (
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [period] NVARCHAR(191) NOT NULL,
    [messagesReserved] INT NOT NULL CONSTRAINT [TenantUsageMonthly_messagesReserved_df] DEFAULT 0,
    [messagesSent] INT NOT NULL CONSTRAINT [TenantUsageMonthly_messagesSent_df] DEFAULT 0,
    [messagesFailed] INT NOT NULL CONSTRAINT [TenantUsageMonthly_messagesFailed_df] DEFAULT 0,
    [mediaBytesUploaded] BIGINT NOT NULL CONSTRAINT [TenantUsageMonthly_mediaBytesUploaded_df] DEFAULT 0,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [TenantUsageMonthly_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [TenantUsageMonthly_pkey] PRIMARY KEY CLUSTERED ([tenantId],[period])
);

-- CreateTable
CREATE TABLE [dbo].[TenantUsageEvent] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [period] NVARCHAR(191) NOT NULL,
    [eventType] NVARCHAR(191) NOT NULL,
    [referenceId] NVARCHAR(191) NOT NULL,
    [units] INT NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [TenantUsageEvent_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [TenantUsageEvent_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [TenantUsageEvent_tenantId_eventType_referenceId_key] UNIQUE NONCLUSTERED ([tenantId],[eventType],[referenceId])
);

-- CreateTable
CREATE TABLE [dbo].[OutboxEvent] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [tenantId] UNIQUEIDENTIFIER,
    [aggregateType] NVARCHAR(191) NOT NULL,
    [aggregateId] NVARCHAR(191) NOT NULL,
    [eventType] NVARCHAR(191) NOT NULL,
    [payload] VARBINARY(max) NOT NULL,
    [status] NVARCHAR(191) NOT NULL CONSTRAINT [OutboxEvent_status_df] DEFAULT 'PENDING',
    [attemptCount] INT NOT NULL CONSTRAINT [OutboxEvent_attemptCount_df] DEFAULT 0,
    [maxAttempts] INT NOT NULL CONSTRAINT [OutboxEvent_maxAttempts_df] DEFAULT 12,
    [availableAt] DATETIME2 NOT NULL CONSTRAINT [OutboxEvent_availableAt_df] DEFAULT CURRENT_TIMESTAMP,
    [lockedBy] NVARCHAR(191),
    [lockExpiresAt] DATETIME2,
    [publishedAt] DATETIME2,
    [lastError] NVARCHAR(max),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [OutboxEvent_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [OutboxEvent_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[WorkerNode] (
    [id] NVARCHAR(191) NOT NULL,
    [shardId] INT NOT NULL,
    [shardCount] INT NOT NULL,
    [status] NVARCHAR(191) NOT NULL CONSTRAINT [WorkerNode_status_df] DEFAULT 'ACTIVE',
    [lastHeartbeatAt] DATETIME2 NOT NULL CONSTRAINT [WorkerNode_lastHeartbeatAt_df] DEFAULT CURRENT_TIMESTAMP,
    [leaseExpiresAt] DATETIME2 NOT NULL,
    [metadata] VARBINARY(max),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [WorkerNode_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [WorkerNode_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Tenant_status_idx] ON [dbo].[Tenant]([status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [AppUser_tenantId_status_idx] ON [dbo].[AppUser]([tenantId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [WhatsAppSession_tenantId_ownerUserId_status_is_bot_active_idx] ON [dbo].[WhatsAppSession]([tenantId], [ownerUserId], [status], [is_bot_active]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [WhatsAppSession_leaseExpiresAt_idx] ON [dbo].[WhatsAppSession]([leaseExpiresAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [WhatsAppSession_shardKey_status_leaseExpiresAt_idx] ON [dbo].[WhatsAppSession]([shardKey], [status], [leaseExpiresAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [BaileysAuthKey_sessionId_category_idx] ON [dbo].[BaileysAuthKey]([sessionId], [category]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [BotFlow_tenantId_isActive_idx] ON [dbo].[BotFlow]([tenantId], [isActive]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [BotFlowSession_sessionId_isEnabled_idx] ON [dbo].[BotFlowSession]([sessionId], [isEnabled]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Conversation_tenantId_is_bot_active_lastMessageAt_idx] ON [dbo].[Conversation]([tenantId], [is_bot_active], [lastMessageAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Conversation_assignedAgentId_idx] ON [dbo].[Conversation]([assignedAgentId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Campaign_tenantId_status_scheduledAt_idx] ON [dbo].[Campaign]([tenantId], [status], [scheduledAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [CampaignSession_sessionId_isEnabled_idx] ON [dbo].[CampaignSession]([sessionId], [isEnabled]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [MediaAsset_tenantId_status_idx] ON [dbo].[MediaAsset]([tenantId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [MediaAsset_sha256_idx] ON [dbo].[MediaAsset]([sha256]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [MediaUpload_sessionId_expiresAt_idx] ON [dbo].[MediaUpload]([sessionId], [expiresAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [MediaPreparationJob_sessionId_status_availableAt_idx] ON [dbo].[MediaPreparationJob]([sessionId], [status], [availableAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [MediaPreparationJob_campaignId_status_idx] ON [dbo].[MediaPreparationJob]([campaignId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [MediaPreparationJob_lockExpiresAt_idx] ON [dbo].[MediaPreparationJob]([lockExpiresAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [MessageQueue_status_availableAt_priority_idx] ON [dbo].[MessageQueue]([status], [availableAt], [priority]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [MessageQueue_assignedSessionId_status_availableAt_idx] ON [dbo].[MessageQueue]([assignedSessionId], [status], [availableAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [MessageQueue_campaignId_status_idx] ON [dbo].[MessageQueue]([campaignId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [MessageQueue_lockExpiresAt_idx] ON [dbo].[MessageQueue]([lockExpiresAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [WhatsAppMessage_tenantId_remoteJid_messageTimestamp_idx] ON [dbo].[WhatsAppMessage]([tenantId], [remoteJid], [messageTimestamp]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [WhatsAppMessage_conversationId_messageTimestamp_idx] ON [dbo].[WhatsAppMessage]([conversationId], [messageTimestamp]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [WhatsAppMessage_queueItemId_idx] ON [dbo].[WhatsAppMessage]([queueItemId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [WhatsAppMessage_status_updatedAt_idx] ON [dbo].[WhatsAppMessage]([status], [updatedAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [MessageReceipt_messageId_receiptAt_idx] ON [dbo].[MessageReceipt]([messageId], [receiptAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [MessageReceipt_receiptType_receiptAt_idx] ON [dbo].[MessageReceipt]([receiptType], [receiptAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ProcessedInboundEvent_tenantId_processedAt_idx] ON [dbo].[ProcessedInboundEvent]([tenantId], [processedAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [MessageAttempt_queueItemId_state_idx] ON [dbo].[MessageAttempt]([queueItemId], [state]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [MessageAttempt_state_reconcileAfter_idx] ON [dbo].[MessageAttempt]([state], [reconcileAfter]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [MessageAttempt_campaignId_state_idx] ON [dbo].[MessageAttempt]([campaignId], [state]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [DeadLetterMessage_tenantId_failedAt_idx] ON [dbo].[DeadLetterMessage]([tenantId], [failedAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [DeadLetterMessage_campaignId_resolvedAt_idx] ON [dbo].[DeadLetterMessage]([campaignId], [resolvedAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [RefreshSession_userId_revokedAt_expiresAt_idx] ON [dbo].[RefreshSession]([userId], [revokedAt], [expiresAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [RefreshSession_familyId_idx] ON [dbo].[RefreshSession]([familyId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [RefreshSession_tenantId_createdAt_idx] ON [dbo].[RefreshSession]([tenantId], [createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [AuditLog_tenantId_createdAt_idx] ON [dbo].[AuditLog]([tenantId], [createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [AuditLog_actorUserId_createdAt_idx] ON [dbo].[AuditLog]([actorUserId], [createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [AuditLog_entityType_entityId_idx] ON [dbo].[AuditLog]([entityType], [entityId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [AuditLog_action_createdAt_idx] ON [dbo].[AuditLog]([action], [createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [RateLimitBucket_resetAt_idx] ON [dbo].[RateLimitBucket]([resetAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [TenantUsageMonthly_period_messagesSent_idx] ON [dbo].[TenantUsageMonthly]([period], [messagesSent]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [TenantUsageEvent_tenantId_period_eventType_idx] ON [dbo].[TenantUsageEvent]([tenantId], [period], [eventType]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [OutboxEvent_status_availableAt_createdAt_idx] ON [dbo].[OutboxEvent]([status], [availableAt], [createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [OutboxEvent_tenantId_createdAt_idx] ON [dbo].[OutboxEvent]([tenantId], [createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [OutboxEvent_lockExpiresAt_idx] ON [dbo].[OutboxEvent]([lockExpiresAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [WorkerNode_status_leaseExpiresAt_idx] ON [dbo].[WorkerNode]([status], [leaseExpiresAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [WorkerNode_shardId_shardCount_idx] ON [dbo].[WorkerNode]([shardId], [shardCount]);

-- AddForeignKey
ALTER TABLE [dbo].[AppUser] ADD CONSTRAINT [AppUser_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[WhatsAppSession] ADD CONSTRAINT [WhatsAppSession_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[WhatsAppSession] ADD CONSTRAINT [WhatsAppSession_ownerUserId_fkey] FOREIGN KEY ([ownerUserId]) REFERENCES [dbo].[AppUser]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[BaileysCredential] ADD CONSTRAINT [BaileysCredential_sessionId_fkey] FOREIGN KEY ([sessionId]) REFERENCES [dbo].[WhatsAppSession]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[BaileysAuthKey] ADD CONSTRAINT [BaileysAuthKey_sessionId_fkey] FOREIGN KEY ([sessionId]) REFERENCES [dbo].[WhatsAppSession]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[BotFlow] ADD CONSTRAINT [BotFlow_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[BotFlowSession] ADD CONSTRAINT [BotFlowSession_flowId_fkey] FOREIGN KEY ([flowId]) REFERENCES [dbo].[BotFlow]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[BotFlowSession] ADD CONSTRAINT [BotFlowSession_sessionId_fkey] FOREIGN KEY ([sessionId]) REFERENCES [dbo].[WhatsAppSession]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Conversation] ADD CONSTRAINT [Conversation_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Conversation] ADD CONSTRAINT [Conversation_sessionId_fkey] FOREIGN KEY ([sessionId]) REFERENCES [dbo].[WhatsAppSession]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Conversation] ADD CONSTRAINT [Conversation_flowId_fkey] FOREIGN KEY ([flowId]) REFERENCES [dbo].[BotFlow]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Conversation] ADD CONSTRAINT [Conversation_assignedAgentId_fkey] FOREIGN KEY ([assignedAgentId]) REFERENCES [dbo].[AppUser]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Campaign] ADD CONSTRAINT [Campaign_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Campaign] ADD CONSTRAINT [Campaign_flowId_fkey] FOREIGN KEY ([flowId]) REFERENCES [dbo].[BotFlow]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Campaign] ADD CONSTRAINT [Campaign_mediaAssetId_fkey] FOREIGN KEY ([mediaAssetId]) REFERENCES [dbo].[MediaAsset]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[CampaignSession] ADD CONSTRAINT [CampaignSession_campaignId_fkey] FOREIGN KEY ([campaignId]) REFERENCES [dbo].[Campaign]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[CampaignSession] ADD CONSTRAINT [CampaignSession_sessionId_fkey] FOREIGN KEY ([sessionId]) REFERENCES [dbo].[WhatsAppSession]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[MediaAsset] ADD CONSTRAINT [MediaAsset_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[MediaUpload] ADD CONSTRAINT [MediaUpload_mediaAssetId_fkey] FOREIGN KEY ([mediaAssetId]) REFERENCES [dbo].[MediaAsset]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[MediaUpload] ADD CONSTRAINT [MediaUpload_sessionId_fkey] FOREIGN KEY ([sessionId]) REFERENCES [dbo].[WhatsAppSession]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[MediaPreparationJob] ADD CONSTRAINT [MediaPreparationJob_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[MediaPreparationJob] ADD CONSTRAINT [MediaPreparationJob_campaignId_fkey] FOREIGN KEY ([campaignId]) REFERENCES [dbo].[Campaign]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[MediaPreparationJob] ADD CONSTRAINT [MediaPreparationJob_mediaAssetId_fkey] FOREIGN KEY ([mediaAssetId]) REFERENCES [dbo].[MediaAsset]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[MediaPreparationJob] ADD CONSTRAINT [MediaPreparationJob_sessionId_fkey] FOREIGN KEY ([sessionId]) REFERENCES [dbo].[WhatsAppSession]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[MessageQueue] ADD CONSTRAINT [MessageQueue_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[MessageQueue] ADD CONSTRAINT [MessageQueue_campaignId_fkey] FOREIGN KEY ([campaignId]) REFERENCES [dbo].[Campaign]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[MessageQueue] ADD CONSTRAINT [MessageQueue_assignedSessionId_fkey] FOREIGN KEY ([assignedSessionId]) REFERENCES [dbo].[WhatsAppSession]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[MessageQueue] ADD CONSTRAINT [MessageQueue_mediaAssetId_fkey] FOREIGN KEY ([mediaAssetId]) REFERENCES [dbo].[MediaAsset]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[WhatsAppMessage] ADD CONSTRAINT [WhatsAppMessage_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[WhatsAppMessage] ADD CONSTRAINT [WhatsAppMessage_sessionId_fkey] FOREIGN KEY ([sessionId]) REFERENCES [dbo].[WhatsAppSession]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[WhatsAppMessage] ADD CONSTRAINT [WhatsAppMessage_conversationId_fkey] FOREIGN KEY ([conversationId]) REFERENCES [dbo].[Conversation]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[WhatsAppMessage] ADD CONSTRAINT [WhatsAppMessage_campaignId_fkey] FOREIGN KEY ([campaignId]) REFERENCES [dbo].[Campaign]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[WhatsAppMessage] ADD CONSTRAINT [WhatsAppMessage_queueItemId_fkey] FOREIGN KEY ([queueItemId]) REFERENCES [dbo].[MessageQueue]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[MessageReceipt] ADD CONSTRAINT [MessageReceipt_messageId_fkey] FOREIGN KEY ([messageId]) REFERENCES [dbo].[WhatsAppMessage]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ProcessedInboundEvent] ADD CONSTRAINT [ProcessedInboundEvent_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ProcessedInboundEvent] ADD CONSTRAINT [ProcessedInboundEvent_sessionId_fkey] FOREIGN KEY ([sessionId]) REFERENCES [dbo].[WhatsAppSession]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[MessageAttempt] ADD CONSTRAINT [MessageAttempt_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[MessageAttempt] ADD CONSTRAINT [MessageAttempt_queueItemId_fkey] FOREIGN KEY ([queueItemId]) REFERENCES [dbo].[MessageQueue]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[MessageAttempt] ADD CONSTRAINT [MessageAttempt_campaignId_fkey] FOREIGN KEY ([campaignId]) REFERENCES [dbo].[Campaign]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[MessageAttempt] ADD CONSTRAINT [MessageAttempt_sessionId_fkey] FOREIGN KEY ([sessionId]) REFERENCES [dbo].[WhatsAppSession]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[DeadLetterMessage] ADD CONSTRAINT [DeadLetterMessage_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[DeadLetterMessage] ADD CONSTRAINT [DeadLetterMessage_queueItemId_fkey] FOREIGN KEY ([queueItemId]) REFERENCES [dbo].[MessageQueue]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[DeadLetterMessage] ADD CONSTRAINT [DeadLetterMessage_campaignId_fkey] FOREIGN KEY ([campaignId]) REFERENCES [dbo].[Campaign]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[DeadLetterMessage] ADD CONSTRAINT [DeadLetterMessage_sessionId_fkey] FOREIGN KEY ([sessionId]) REFERENCES [dbo].[WhatsAppSession]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[RefreshSession] ADD CONSTRAINT [RefreshSession_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[RefreshSession] ADD CONSTRAINT [RefreshSession_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[AppUser]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[AuditLog] ADD CONSTRAINT [AuditLog_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[AuditLog] ADD CONSTRAINT [AuditLog_actorUserId_fkey] FOREIGN KEY ([actorUserId]) REFERENCES [dbo].[AppUser]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[TenantCapacityPolicy] ADD CONSTRAINT [TenantCapacityPolicy_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[TenantUsageMonthly] ADD CONSTRAINT [TenantUsageMonthly_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[TenantUsageEvent] ADD CONSTRAINT [TenantUsageEvent_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[OutboxEvent] ADD CONSTRAINT [OutboxEvent_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
