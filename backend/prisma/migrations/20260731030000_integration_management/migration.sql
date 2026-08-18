BEGIN TRY
BEGIN TRAN;

CREATE TABLE [dbo].[IntegrationApiKey] (
  [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [IntegrationApiKey_pkey] PRIMARY KEY DEFAULT NEWID(),
  [tenantId] UNIQUEIDENTIFIER NOT NULL,
  [createdByUserId] UNIQUEIDENTIFIER NOT NULL,
  [name] NVARCHAR(191) NOT NULL,
  [keyPrefix] NVARCHAR(32) NOT NULL,
  [keyHash] NVARCHAR(128) NOT NULL,
  [permissionsPayload] VARBINARY(max) NOT NULL,
  [status] NVARCHAR(32) NOT NULL CONSTRAINT [IntegrationApiKey_status_df] DEFAULT 'ACTIVE',
  [expiresAt] DATETIME2,
  [lastUsedAt] DATETIME2,
  [revokedAt] DATETIME2,
  [createdAt] DATETIME2 NOT NULL CONSTRAINT [IntegrationApiKey_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
  [updatedAt] DATETIME2 NOT NULL CONSTRAINT [IntegrationApiKey_updatedAt_df] DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT [IntegrationApiKey_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]),
  CONSTRAINT [IntegrationApiKey_createdByUserId_fkey] FOREIGN KEY ([createdByUserId]) REFERENCES [dbo].[AppUser]([id]),
  CONSTRAINT [IntegrationApiKey_tenantId_name_key] UNIQUE ([tenantId], [name]),
  CONSTRAINT [IntegrationApiKey_keyHash_key] UNIQUE ([keyHash])
);

CREATE TABLE [dbo].[WebhookEndpoint] (
  [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [WebhookEndpoint_pkey] PRIMARY KEY DEFAULT NEWID(),
  [tenantId] UNIQUEIDENTIFIER NOT NULL,
  [createdByUserId] UNIQUEIDENTIFIER NOT NULL,
  [name] NVARCHAR(191) NOT NULL,
  [url] NVARCHAR(1000) NOT NULL,
  [secretPayload] VARBINARY(max) NOT NULL,
  [eventsPayload] VARBINARY(max) NOT NULL,
  [status] NVARCHAR(32) NOT NULL CONSTRAINT [WebhookEndpoint_status_df] DEFAULT 'ACTIVE',
  [lastSuccessAt] DATETIME2,
  [lastFailureAt] DATETIME2,
  [createdAt] DATETIME2 NOT NULL CONSTRAINT [WebhookEndpoint_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
  [updatedAt] DATETIME2 NOT NULL CONSTRAINT [WebhookEndpoint_updatedAt_df] DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT [WebhookEndpoint_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]),
  CONSTRAINT [WebhookEndpoint_createdByUserId_fkey] FOREIGN KEY ([createdByUserId]) REFERENCES [dbo].[AppUser]([id]),
  CONSTRAINT [WebhookEndpoint_tenantId_name_key] UNIQUE ([tenantId], [name])
);

CREATE TABLE [dbo].[WebhookDelivery] (
  [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [WebhookDelivery_pkey] PRIMARY KEY DEFAULT NEWID(),
  [tenantId] UNIQUEIDENTIFIER NOT NULL,
  [webhookId] UNIQUEIDENTIFIER NOT NULL,
  [eventType] NVARCHAR(191) NOT NULL,
  [aggregateType] NVARCHAR(191),
  [aggregateId] NVARCHAR(191),
  [payload] VARBINARY(max) NOT NULL,
  [status] NVARCHAR(32) NOT NULL CONSTRAINT [WebhookDelivery_status_df] DEFAULT 'PENDING',
  [attemptCount] INT NOT NULL CONSTRAINT [WebhookDelivery_attemptCount_df] DEFAULT 0,
  [maxAttempts] INT NOT NULL CONSTRAINT [WebhookDelivery_maxAttempts_df] DEFAULT 5,
  [availableAt] DATETIME2 NOT NULL CONSTRAINT [WebhookDelivery_availableAt_df] DEFAULT CURRENT_TIMESTAMP,
  [processingAt] DATETIME2,
  [deliveredAt] DATETIME2,
  [failedAt] DATETIME2,
  [responseStatus] INT,
  [responseBody] NVARCHAR(2000),
  [lastError] NVARCHAR(2000),
  [lockedBy] NVARCHAR(191),
  [lockExpiresAt] DATETIME2,
  [createdAt] DATETIME2 NOT NULL CONSTRAINT [WebhookDelivery_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
  [updatedAt] DATETIME2 NOT NULL CONSTRAINT [WebhookDelivery_updatedAt_df] DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT [WebhookDelivery_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]),
  CONSTRAINT [WebhookDelivery_webhookId_fkey] FOREIGN KEY ([webhookId]) REFERENCES [dbo].[WebhookEndpoint]([id]) ON DELETE CASCADE
);

CREATE TABLE [dbo].[IntegrationRequestLog] (
  [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [IntegrationRequestLog_pkey] PRIMARY KEY DEFAULT NEWID(),
  [tenantId] UNIQUEIDENTIFIER NOT NULL,
  [apiKeyId] UNIQUEIDENTIFIER,
  [endpoint] NVARCHAR(500) NOT NULL,
  [method] NVARCHAR(16) NOT NULL,
  [statusCode] INT NOT NULL,
  [durationMs] INT NOT NULL,
  [requestId] NVARCHAR(191),
  [idempotencyKey] NVARCHAR(191),
  [remoteIp] NVARCHAR(191),
  [errorMessage] NVARCHAR(2000),
  [createdAt] DATETIME2 NOT NULL CONSTRAINT [IntegrationRequestLog_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT [IntegrationRequestLog_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]),
  CONSTRAINT [IntegrationRequestLog_apiKeyId_fkey] FOREIGN KEY ([apiKeyId]) REFERENCES [dbo].[IntegrationApiKey]([id])
);

CREATE NONCLUSTERED INDEX [IntegrationApiKey_tenantId_status_idx] ON [dbo].[IntegrationApiKey]([tenantId], [status]);
CREATE NONCLUSTERED INDEX [IntegrationApiKey_expiresAt_idx] ON [dbo].[IntegrationApiKey]([expiresAt]);
CREATE NONCLUSTERED INDEX [WebhookEndpoint_tenantId_status_idx] ON [dbo].[WebhookEndpoint]([tenantId], [status]);
CREATE NONCLUSTERED INDEX [WebhookDelivery_status_availableAt_idx] ON [dbo].[WebhookDelivery]([status], [availableAt]);
CREATE NONCLUSTERED INDEX [WebhookDelivery_tenantId_createdAt_idx] ON [dbo].[WebhookDelivery]([tenantId], [createdAt]);
CREATE NONCLUSTERED INDEX [WebhookDelivery_webhookId_createdAt_idx] ON [dbo].[WebhookDelivery]([webhookId], [createdAt]);
CREATE NONCLUSTERED INDEX [IntegrationRequestLog_tenantId_createdAt_idx] ON [dbo].[IntegrationRequestLog]([tenantId], [createdAt]);
CREATE NONCLUSTERED INDEX [IntegrationRequestLog_apiKeyId_createdAt_idx] ON [dbo].[IntegrationRequestLog]([apiKeyId], [createdAt]);
CREATE NONCLUSTERED INDEX [IntegrationRequestLog_statusCode_createdAt_idx] ON [dbo].[IntegrationRequestLog]([statusCode], [createdAt]);

COMMIT TRAN;
END TRY
BEGIN CATCH
IF @@TRANCOUNT > 0 ROLLBACK TRAN;
THROW;
END CATCH
