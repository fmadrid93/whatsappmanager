import type {
  ConversationListQuery,
  IConversationRepository,
} from "../ports/repositories/conversation.repository.js";

export class HumanHandoffService {
  constructor(private readonly conversations: IConversationRepository) {}

  list(tenantId: string, query?: ConversationListQuery) {
    return this.conversations.listByTenant(tenantId, query);
  }

  get(tenantId: string, conversationId: string) {
    return this.conversations.findById(tenantId, conversationId);
  }

  messages(tenantId: string, conversationId: string, take = 100, before?: Date) {
    return this.conversations.listMessages({ tenantId, conversationId, take, before });
  }

  notes(tenantId: string, conversationId: string) {
    return this.conversations.listNotes(tenantId, conversationId);
  }

  addNote(tenantId: string, conversationId: string, authorUserId: string, text: string) {
    return this.conversations.addNote({ tenantId, conversationId, authorUserId, text });
  }

  updateProfile(
    tenantId: string,
    conversationId: string,
    input: { displayName?: string; tags?: string[] },
  ) {
    return this.conversations.updateProfile({ tenantId, conversationId, ...input });
  }

  markRead(tenantId: string, conversationId: string) {
    return this.conversations.markRead(tenantId, conversationId);
  }

  close(tenantId: string, conversationId: string) {
    return this.conversations.setClosed(tenantId, conversationId, true);
  }

  reopen(tenantId: string, conversationId: string) {
    return this.conversations.setClosed(tenantId, conversationId, false);
  }

  resetFlow(tenantId: string, conversationId: string) {
    return this.conversations.findById(tenantId, conversationId).then(async (conversation) => {
      if (!conversation) throw new Error("Conversación no encontrada.");
      await this.conversations.clearFlowState(conversationId);
    });
  }

  sendText(tenantId: string, conversationId: string, actorUserId: string, text: string) {
    return this.conversations.enqueueText({ tenantId, conversationId, actorUserId, text });
  }

  sendDirectText(
    tenantId: string,
    actorUserId: string,
    input: { sessionId: string; phone: string; displayName?: string; text: string },
  ) {
    const digits = input.phone.replace(/\D/g, "");
    if (digits.length < 8 || digits.length > 15) {
      throw new Error("Número inválido. Incluye código de país, por ejemplo +59172620787.");
    }

    return this.conversations.enqueueDirectText({
      tenantId,
      sessionId: input.sessionId,
      actorUserId,
      phoneE164: `+${digits}`,
      displayName: input.displayName?.trim() || undefined,
      text: input.text.trim(),
    });
  }

  async takeOver(tenantId: string, conversationId: string, agentId: string): Promise<void> {
    await this.conversations.setHumanMode({
      conversationId,
      tenantId,
      active: true,
      agentId,
    });
  }

  async release(tenantId: string, conversationId: string): Promise<void> {
    await this.conversations.setHumanMode({ conversationId, tenantId, active: false });
  }
}
