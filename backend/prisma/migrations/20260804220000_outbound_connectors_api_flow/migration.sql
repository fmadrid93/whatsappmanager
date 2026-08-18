BEGIN TRY
BEGIN TRAN;

CREATE TABLE [dbo].[ExternalConnector] (
  [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [ExternalConnector_pkey] PRIMARY KEY DEFAULT NEWID(),
  [tenantId] UNIQUEIDENTIFIER NOT NULL,
  [createdByUserId] UNIQUEIDENTIFIER NOT NULL,
  [name] NVARCHAR(191) NOT NULL,
  [purpose] NVARCHAR(32) NOT NULL CONSTRAINT [ExternalConnector_purpose_df] DEFAULT 'GENERAL',
  [method] NVARCHAR(16) NOT NULL CONSTRAINT [ExternalConnector_method_df] DEFAULT 'GET',
  [urlTemplate] NVARCHAR(1000) NOT NULL,
  [headersPayload] VARBINARY(max) NOT NULL,
  [bodyTemplate] NVARCHAR(max),
  [authType] NVARCHAR(32) NOT NULL CONSTRAINT [ExternalConnector_authType_df] DEFAULT 'NONE',
  [authName] NVARCHAR(191),
  [secretPayload] VARBINARY(max),
  [timeoutMs] INT NOT NULL CONSTRAINT [ExternalConnector_timeoutMs_df] DEFAULT 10000,
  [itemsPath] NVARCHAR(500),
  [phonePath] NVARCHAR(500),
  [namePath] NVARCHAR(500),
  [contactMappingsPayload] VARBINARY(max) NOT NULL,
  [status] NVARCHAR(32) NOT NULL CONSTRAINT [ExternalConnector_status_df] DEFAULT 'ACTIVE',
  [lastSuccessAt] DATETIME2,
  [lastFailureAt] DATETIME2,
  [createdAt] DATETIME2 NOT NULL CONSTRAINT [ExternalConnector_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
  [updatedAt] DATETIME2 NOT NULL CONSTRAINT [ExternalConnector_updatedAt_df] DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT [ExternalConnector_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]),
  CONSTRAINT [ExternalConnector_createdByUserId_fkey] FOREIGN KEY ([createdByUserId]) REFERENCES [dbo].[AppUser]([id]),
  CONSTRAINT [ExternalConnector_tenantId_name_key] UNIQUE ([tenantId], [name])
);

CREATE TABLE [dbo].[ExternalConnectorExecution] (
  [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [ExternalConnectorExecution_pkey] PRIMARY KEY DEFAULT NEWID(),
  [tenantId] UNIQUEIDENTIFIER NOT NULL,
  [connectorId] UNIQUEIDENTIFIER NOT NULL,
  [contextType] NVARCHAR(32) NOT NULL,
  [contextId] NVARCHAR(191),
  [outcome] NVARCHAR(32) NOT NULL,
  [method] NVARCHAR(16) NOT NULL,
  [requestUrl] NVARCHAR(1000) NOT NULL,
  [responseStatus] INT,
  [durationMs] INT NOT NULL,
  [mappedCount] INT NOT NULL CONSTRAINT [ExternalConnectorExecution_mappedCount_df] DEFAULT 0,
  [responsePreview] NVARCHAR(2000),
  [errorMessage] NVARCHAR(2000),
  [createdAt] DATETIME2 NOT NULL CONSTRAINT [ExternalConnectorExecution_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT [ExternalConnectorExecution_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]),
  CONSTRAINT [ExternalConnectorExecution_connectorId_fkey] FOREIGN KEY ([connectorId]) REFERENCES [dbo].[ExternalConnector]([id]) ON DELETE CASCADE
);

CREATE NONCLUSTERED INDEX [ExternalConnector_tenantId_purpose_status_idx]
  ON [dbo].[ExternalConnector]([tenantId], [purpose], [status]);
CREATE NONCLUSTERED INDEX [ExternalConnector_createdByUserId_idx]
  ON [dbo].[ExternalConnector]([createdByUserId]);
CREATE NONCLUSTERED INDEX [ExternalConnectorExecution_tenantId_createdAt_idx]
  ON [dbo].[ExternalConnectorExecution]([tenantId], [createdAt]);
CREATE NONCLUSTERED INDEX [ExternalConnectorExecution_connectorId_createdAt_idx]
  ON [dbo].[ExternalConnectorExecution]([connectorId], [createdAt]);
CREATE NONCLUSTERED INDEX [ExternalConnectorExecution_outcome_createdAt_idx]
  ON [dbo].[ExternalConnectorExecution]([outcome], [createdAt]);

COMMIT TRAN;
END TRY
BEGIN CATCH
IF @@TRANCOUNT > 0 ROLLBACK TRAN;
THROW;
END CATCH
