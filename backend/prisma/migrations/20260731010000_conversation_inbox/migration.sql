BEGIN TRY
BEGIN TRAN;

ALTER TABLE [dbo].[Conversation] ADD
  [displayName] NVARCHAR(191),
  [status] NVARCHAR(32) NOT NULL CONSTRAINT [Conversation_status_df] DEFAULT 'OPEN',
  [unreadCount] INT NOT NULL CONSTRAINT [Conversation_unreadCount_df] DEFAULT 0,
  [tagsPayload] VARBINARY(max),
  [closedAt] DATETIME2,
  [lastReadAt] DATETIME2;

CREATE TABLE [dbo].[ConversationNote] (
  [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [ConversationNote_pkey] PRIMARY KEY DEFAULT NEWID(),
  [tenantId] UNIQUEIDENTIFIER NOT NULL,
  [conversationId] UNIQUEIDENTIFIER NOT NULL,
  [authorUserId] UNIQUEIDENTIFIER NOT NULL,
  [text] NVARCHAR(2000) NOT NULL,
  [createdAt] DATETIME2 NOT NULL CONSTRAINT [ConversationNote_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT [ConversationNote_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]),
  CONSTRAINT [ConversationNote_conversationId_fkey] FOREIGN KEY ([conversationId]) REFERENCES [dbo].[Conversation]([id]) ON DELETE CASCADE,
  CONSTRAINT [ConversationNote_authorUserId_fkey] FOREIGN KEY ([authorUserId]) REFERENCES [dbo].[AppUser]([id])
);

CREATE TABLE [dbo].[ConversationOutbox] (
  [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [ConversationOutbox_pkey] PRIMARY KEY DEFAULT NEWID(),
  [tenantId] UNIQUEIDENTIFIER NOT NULL,
  [conversationId] UNIQUEIDENTIFIER NOT NULL,
  [sessionId] UNIQUEIDENTIFIER NOT NULL,
  [remoteJid] NVARCHAR(191) NOT NULL,
  [actorUserId] UNIQUEIDENTIFIER NOT NULL,
  [text] NVARCHAR(MAX) NOT NULL,
  [status] NVARCHAR(32) NOT NULL CONSTRAINT [ConversationOutbox_status_df] DEFAULT 'PENDING',
  [attemptCount] INT NOT NULL CONSTRAINT [ConversationOutbox_attemptCount_df] DEFAULT 0,
  [maxAttempts] INT NOT NULL CONSTRAINT [ConversationOutbox_maxAttempts_df] DEFAULT 3,
  [availableAt] DATETIME2 NOT NULL CONSTRAINT [ConversationOutbox_availableAt_df] DEFAULT CURRENT_TIMESTAMP,
  [processingAt] DATETIME2,
  [sentAt] DATETIME2,
  [failedAt] DATETIME2,
  [whatsappMessageId] NVARCHAR(191),
  [lastErrorCode] NVARCHAR(191),
  [lastErrorMessage] NVARCHAR(2000),
  [lockedBy] NVARCHAR(191),
  [lockExpiresAt] DATETIME2,
  [createdAt] DATETIME2 NOT NULL CONSTRAINT [ConversationOutbox_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
  [updatedAt] DATETIME2 NOT NULL CONSTRAINT [ConversationOutbox_updatedAt_df] DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT [ConversationOutbox_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]),
  CONSTRAINT [ConversationOutbox_conversationId_fkey] FOREIGN KEY ([conversationId]) REFERENCES [dbo].[Conversation]([id]) ON DELETE CASCADE,
  CONSTRAINT [ConversationOutbox_sessionId_fkey] FOREIGN KEY ([sessionId]) REFERENCES [dbo].[WhatsAppSession]([id]),
  CONSTRAINT [ConversationOutbox_actorUserId_fkey] FOREIGN KEY ([actorUserId]) REFERENCES [dbo].[AppUser]([id])
);

CREATE NONCLUSTERED INDEX [Conversation_tenantId_status_lastMessageAt_idx]
  ON [dbo].[Conversation]([tenantId], [status], [lastMessageAt]);
CREATE NONCLUSTERED INDEX [ConversationNote_tenantId_conversationId_createdAt_idx]
  ON [dbo].[ConversationNote]([tenantId], [conversationId], [createdAt]);
CREATE NONCLUSTERED INDEX [ConversationOutbox_sessionId_status_availableAt_idx]
  ON [dbo].[ConversationOutbox]([sessionId], [status], [availableAt]);
CREATE NONCLUSTERED INDEX [ConversationOutbox_conversationId_createdAt_idx]
  ON [dbo].[ConversationOutbox]([conversationId], [createdAt]);

COMMIT TRAN;
END TRY
BEGIN CATCH
IF @@TRANCOUNT > 0 ROLLBACK TRAN;
THROW;
END CATCH
