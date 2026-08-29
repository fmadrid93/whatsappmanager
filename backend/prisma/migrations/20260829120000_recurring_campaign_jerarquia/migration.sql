BEGIN TRY

BEGIN TRAN;

-- AlterTable: connectorId ahora es opcional (un envío recurrente puede
-- alimentarse de un ExternalConnector *o* de una selección jerárquica 1x10,
-- nunca ambos) y se agregan sourceType + jerarquiaSelectionPayload.
ALTER TABLE [dbo].[RecurringCampaign] ALTER COLUMN [connectorId] UNIQUEIDENTIFIER NULL;
ALTER TABLE [dbo].[RecurringCampaign] ADD
    [sourceType] NVARCHAR(20) NOT NULL CONSTRAINT [RecurringCampaign_sourceType_df] DEFAULT 'CONNECTOR',
    [jerarquiaSelectionPayload] VARBINARY(max) NOT NULL CONSTRAINT [RecurringCampaign_jerarquiaSelectionPayload_df]
        DEFAULT (CONVERT(VARBINARY(max), '{"territorioIds":[],"administradorIds":[],"gerenteIds":[],"movilizadorIds":[]}'));

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
