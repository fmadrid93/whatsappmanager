export interface ConversationRecord {
  id: string;
  tenantId: string;
  sessionId: string;
  sessionName?: string;
  remoteJid: string;
  phoneE164?: string;
  displayName?: string;
  status: "OPEN" | "CLOSED";
  unreadCount: number;
  tags: string[];
  isBotActive: boolean;
  sessionBotActive: boolean;
  assignedAgentId?: string;
  assignedAgentName?: string;
  assignedAgentEmail?: string;
  lastMessageAt?: Date;
  lastMessagePreview?: string;
  lastMessageDirection?: "INBOUND" | "OUTBOUND";
  flowId?: string;
  flowName?: string;
  flowNodeId?: string;
  flowAwaitingVariable?: string;
  flowVariables?: Record<string, string>;
  closedAt?: Date;
  lastReadAt?: Date;
}

export interface ConversationFlowState {
  flowId: string;
  nodeIndex: number;
  awaitingVariable?: string;
  variables: Record<string, string>;
}

export interface ConversationListQuery {
  search?: string;
  mode?: "BOT" | "HUMAN" | "ALL";
  status?: "OPEN" | "CLOSED" | "ALL";
  sessionId?: string;
  assignedAgentId?: string;
  take?: number;
}

export interface ConversationMessageRecord {
  id: string;
  whatsappMessageId: string;
  direction: "INBOUND" | "OUTBOUND";
  messageType: string;
  status: string;
  text?: string;
  fromMe: boolean;
  messageTimestamp: Date;
}

export interface ConversationNoteRecord {
  id: string;
  text: string;
  authorUserId: string;
  authorName: string;
  authorEmail: string;
  createdAt: Date;
}

export interface ConversationOutboxRecord {
  id: string;
  tenantId: string;
  conversationId: string;
  sessionId: string;
  remoteJid: string;
  actorUserId: string;
  text: string;
  status: string;
  attemptCount: number;
  maxAttempts: number;
}

export interface IConversationRepository {
  recordInbound(input: {
    tenantId: string;
    sessionId: string;
    remoteJid: string;
    messageId?: string;
    displayName?: string;
  }): Promise<ConversationRecord>;
  listByTenant(tenantId: string, query?: ConversationListQuery): Promise<ConversationRecord[]>;
  findById(tenantId: string, conversationId: string): Promise<ConversationRecord | null>;
  listMessages(input: {
    tenantId: string;
    conversationId: string;
    take: number;
    before?: Date;
  }): Promise<ConversationMessageRecord[]>;
  listNotes(tenantId: string, conversationId: string): Promise<ConversationNoteRecord[]>;
  addNote(input: {
    tenantId: string;
    conversationId: string;
    authorUserId: string;
    text: string;
  }): Promise<ConversationNoteRecord>;
  updateProfile(input: {
    tenantId: string;
    conversationId: string;
    displayName?: string;
    tags?: string[];
  }): Promise<void>;
  markRead(tenantId: string, conversationId: string): Promise<void>;
  setClosed(tenantId: string, conversationId: string, closed: boolean): Promise<void>;
  enqueueText(input: {
    tenantId: string;
    conversationId: string;
    actorUserId: string;
    text: string;
  }): Promise<string>;
  enqueueDirectText(input: {
    tenantId: string;
    sessionId: string;
    actorUserId: string;
    phoneE164: string;
    displayName?: string;
    text: string;
  }): Promise<{ conversationId: string; outboxId: string }>;
  claimNextOutbox(input: {
    sessionId: string;
    workerId: string;
    lockExpiresAt: Date;
  }): Promise<ConversationOutboxRecord | null>;
  markOutboxSent(id: string, whatsappMessageId: string): Promise<void>;
  markOutboxFailed(input: {
    id: string;
    code: string;
    message: string;
    retryAt: Date;
  }): Promise<void>;
  setHumanMode(input: {
    conversationId: string;
    tenantId: string;
    active: boolean;
    agentId?: string;
  }): Promise<void>;
  saveFlowState(conversationId: string, state: ConversationFlowState): Promise<void>;
  clearFlowState(conversationId: string): Promise<void>;
}
