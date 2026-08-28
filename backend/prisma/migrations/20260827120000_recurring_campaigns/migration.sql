BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[RecurringCampaign] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [createdByUserId] UNIQUEIDENTIFIER NOT NULL,
    [connectorId] UNIQUEIDENTIFIER NOT NULL,
    [mediaAssetId] UNIQUEIDENTIFIER,
    [name] NVARCHAR(191) NOT NULL,
    [connectorVariablesPayload] VARBINARY(max) NOT NULL,
    [sessionIdsPayload] VARBINARY(max) NOT NULL,
    [messagePayload] VARBINARY(max) NOT NULL,
    [defaultRegion] NVARCHAR(2) NOT NULL,
    [intervalMinutes] INT NOT NULL CONSTRAINT [RecurringCampaign_intervalMinutes_df] DEFAULT 60,
    [status] NVARCHAR(32) NOT NULL CONSTRAINT [RecurringCampaign_status_df] DEFAULT 'ACTIVE',
    [lastRunAt] DATETIME2,
    [lastRunOutcome] NVARCHAR(32),
    [lastRunContactsFound] INT,
    [lastRunContactsNew] INT,
    [lastRunError] NVARCHAR(2000),
    [lastCampaignId] UNIQUEIDENTIFIER,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [RecurringCampaign_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [RecurringCampaign_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [RecurringCampaign_tenantId_status_idx] ON [dbo].[RecurringCampaign]([tenantId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [RecurringCampaign_status_lastRunAt_idx] ON [dbo].[RecurringCampaign]([status], [lastRunAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [MessageQueue_tenantId_recipientE164_idx] ON [dbo].[MessageQueue]([tenantId], [recipientE164]);

-- AddForeignKey
ALTER TABLE [dbo].[RecurringCampaign] ADD CONSTRAINT [RecurringCampaign_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[RecurringCampaign] ADD CONSTRAINT [RecurringCampaign_createdByUserId_fkey] FOREIGN KEY ([createdByUserId]) REFERENCES [dbo].[AppUser]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[RecurringCampaign] ADD CONSTRAINT [RecurringCampaign_connectorId_fkey] FOREIGN KEY ([connectorId]) REFERENCES [dbo].[ExternalConnector]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[RecurringCampaign] ADD CONSTRAINT [RecurringCampaign_mediaAssetId_fkey] FOREIGN KEY ([mediaAssetId]) REFERENCES [dbo].[MediaAsset]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

