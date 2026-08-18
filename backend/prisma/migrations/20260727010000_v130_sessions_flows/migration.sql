BEGIN TRY
BEGIN TRAN;

ALTER TABLE [dbo].[WhatsAppSession] ADD
  [expectedPhoneE164] NVARCHAR(191),
  [pairingMethod] NVARCHAR(20) NOT NULL CONSTRAINT [WhatsAppSession_pairingMethod_df] DEFAULT 'QR',
  [pairingCode] NVARCHAR(32),
  [pairingCodeUpdatedAt] DATETIME2,
  [lastConnectionCode] INT,
  [lastConnectionError] NVARCHAR(2000),
  [lastConnectionAt] DATETIME2,
  [deletedAt] DATETIME2;

ALTER TABLE [dbo].[Conversation] ADD
  [flowNodeId] NVARCHAR(191),
  [flowAwaitingVariable] NVARCHAR(191),
  [flowVariablesPayload] VARBINARY(max),
  [flowUpdatedAt] DATETIME2;

CREATE NONCLUSTERED INDEX [WhatsAppSession_tenantId_deletedAt_status_idx]
  ON [dbo].[WhatsAppSession]([tenantId], [deletedAt], [status]);

COMMIT TRAN;
END TRY
BEGIN CATCH
IF @@TRANCOUNT > 0 ROLLBACK TRAN;
THROW;
END CATCH
