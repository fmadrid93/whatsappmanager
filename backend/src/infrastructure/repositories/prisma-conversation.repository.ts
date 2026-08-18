import { proto } from "@whiskeysockets/baileys";
import type { Prisma, PrismaClient } from "@prisma/client";
import type {
  ConversationFlowState,
  ConversationListQuery,
  ConversationMessageRecord,
  ConversationNoteRecord,
  ConversationOutboxRecord,
  ConversationRecord,
  IConversationRepository,
} from "../../application/ports/repositories/conversation.repository.js";
import { decodeJson, encodeJson } from "../../shared/utils/json-buffer.js";

function mapVariables(payload: Uint8Array | null): Record<string, string> | undefined {
  if (!payload) return undefined;
  try {
    return decodeJson<Record<string, string>>(payload);
  } catch {
    return undefined;
  }
}

function mapTags(payload: Uint8Array | null): string[] {
  if (!payload) return [];
  try {
    const value = decodeJson<unknown>(payload);
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string").slice(0, 20)
      : [];
  } catch {
    return [];
  }
}

function messageText(payload: Uint8Array, messageType: string): string | undefined {
  try {
    const message = proto.Message.decode(payload);
    return message.conversation
      ?? message.extendedTextMessage?.text
      ?? message.imageMessage?.caption
      ?? message.videoMessage?.caption
      ?? message.documentMessage?.caption
      ?? message.buttonsResponseMessage?.selectedDisplayText
      ?? message.listResponseMessage?.title
      ?? (messageType === "imageMessage" ? "[Imagen]" : undefined)
      ?? (messageType === "videoMessage" ? "[Video]" : undefined)
      ?? (messageType === "audioMessage" ? "[Audio]" : undefined)
      ?? (messageType === "documentMessage" ? "[Documento]" : undefined)
      ?? `[${messageType}]`;
  } catch {
    return `[${messageType}]`;
  }
}

type ConversationWithRelations = Prisma.ConversationGetPayload<{
  include: {
    session: { select: { name: true; isBotActive: true } };
    assignedAgent: { select: { displayName: true; email: true } };
    flow: { select: { name: true } };
    messages: {
      orderBy: { messageTimestamp: "desc" };
      take: 1;
      select: {
        direction: true;
        messageType: true;
        payload: true;
      };
    };
  };
}>;

function mapConversation(row: ConversationWithRelations): ConversationRecord {
  const latest = row.messages[0];
  return {
    id: row.id,
    tenantId: row.tenantId,
    sessionId: row.sessionId,
    sessionName: row.session.name,
    remoteJid: row.remoteJid,
    phoneE164: row.phoneE164 ?? undefined,
    displayName: row.displayName ?? undefined,
    status: row.status === "CLOSED" ? "CLOSED" : "OPEN",
    unreadCount: row.unreadCount,
    tags: mapTags(row.tagsPayload),
    isBotActive: row.isBotActive,
    sessionBotActive: row.session.isBotActive,
    assignedAgentId: row.assignedAgentId ?? undefined,
    assignedAgentName: row.assignedAgent?.displayName ?? undefined,
    assignedAgentEmail: row.assignedAgent?.email ?? undefined,
    lastMessageAt: row.lastMessageAt ?? undefined,
    lastMessagePreview: latest ? messageText(latest.payload, latest.messageType) : undefined,
    lastMessageDirection: latest?.direction === "OUTBOUND" ? "OUTBOUND" : latest ? "INBOUND" : undefined,
    flowId: row.flowId ?? undefined,
    flowName: row.flow?.name ?? undefined,
    flowNodeId: row.flowNodeId ?? undefined,
    flowAwaitingVariable: row.flowAwaitingVariable ?? undefined,
    flowVariables: mapVariables(row.flowVariablesPayload),
    closedAt: row.closedAt ?? undefined,
    lastReadAt: row.lastReadAt ?? undefined,
  };
}

const conversationInclude = {
  session: { select: { name: true, isBotActive: true } },
  assignedAgent: { select: { displayName: true, email: true } },
  flow: { select: { name: true } },
  messages: {
    orderBy: { messageTimestamp: "desc" as const },
    take: 1,
    select: { direction: true, messageType: true, payload: true },
  },
} satisfies Prisma.ConversationInclude;

export class PrismaConversationRepository implements IConversationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async recordInbound(input: {
    tenantId: string;
    sessionId: string;
    remoteJid: string;
    messageId?: string;
    displayName?: string;
  }): Promise<ConversationRecord> {
    const phone = input.remoteJid.endsWith("@s.whatsapp.net")
      ? `+${input.remoteJid.split("@")[0]?.replace(/\D/g, "") ?? ""}`
      : undefined;
    const row = await this.prisma.conversation.upsert({
      where: { sessionId_remoteJid: { sessionId: input.sessionId, remoteJid: input.remoteJid } },
      create: {
        tenantId: input.tenantId,
        sessionId: input.sessionId,
        remoteJid: input.remoteJid,
        phoneE164: phone,
        displayName: input.displayName?.trim() || undefined,
        lastInboundMessageId: input.messageId,
        lastMessageAt: new Date(),
        unreadCount: 1,
        status: "OPEN",
      },
      update: {
        phoneE164: phone,
        ...(input.displayName?.trim() ? { displayName: input.displayName.trim() } : {}),
        lastInboundMessageId: input.messageId,
        lastMessageAt: new Date(),
        unreadCount: { increment: 1 },
        status: "OPEN",
        closedAt: null,
      },
      include: conversationInclude,
    });
    return mapConversation(row);
  }

  async listByTenant(tenantId: string, query: ConversationListQuery = {}): Promise<ConversationRecord[]> {
    const search = query.search?.trim();
    const where: Prisma.ConversationWhereInput = {
      tenantId,
      ...(query.mode === "BOT" ? { isBotActive: true } : query.mode === "HUMAN" ? { isBotActive: false } : {}),
      ...(query.status && query.status !== "ALL" ? { status: query.status } : {}),
      ...(query.sessionId ? { sessionId: query.sessionId } : {}),
      ...(query.assignedAgentId ? { assignedAgentId: query.assignedAgentId } : {}),
      ...(search ? {
        OR: [
          { displayName: { contains: search } },
          { phoneE164: { contains: search } },
          { remoteJid: { contains: search } },
          { assignedAgent: { is: { email: { contains: search } } } },
        ],
      } : {}),
    };
    const rows = await this.prisma.conversation.findMany({
      where,
      include: conversationInclude,
      orderBy: [{ status: "asc" }, { lastMessageAt: "desc" }],
      take: Math.min(Math.max(query.take ?? 500, 1), 500),
    });
    return rows.map(mapConversation);
  }

  async findById(tenantId: string, conversationId: string): Promise<ConversationRecord | null> {
    const row = await this.prisma.conversation.findFirst({
      where: { id: conversationId, tenantId },
      include: conversationInclude,
    });
    return row ? mapConversation(row) : null;
  }

  async listMessages(input: {
    tenantId: string;
    conversationId: string;
    take: number;
    before?: Date;
  }): Promise<ConversationMessageRecord[]> {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: input.conversationId, tenantId: input.tenantId },
      select: { id: true },
    });
    if (!conversation) return [];
    const [messageRows, outboxRows] = await Promise.all([
      this.prisma.whatsAppMessage.findMany({
        where: {
          conversationId: input.conversationId,
          ...(input.before ? { messageTimestamp: { lt: input.before } } : {}),
        },
        orderBy: { messageTimestamp: "desc" },
        take: Math.min(Math.max(input.take, 1), 250),
        select: {
          id: true,
          whatsappMessageId: true,
          direction: true,
          messageType: true,
          status: true,
          payload: true,
          fromMe: true,
          messageTimestamp: true,
        },
      }),
      this.prisma.conversationOutbox.findMany({
        where: {
          conversationId: input.conversationId,
          status: { in: ["PENDING", "PROCESSING", "FAILED"] },
          ...(input.before ? { createdAt: { lt: input.before } } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: { id: true, text: true, status: true, createdAt: true },
      }),
    ]);

    const messages: ConversationMessageRecord[] = messageRows.map((row) => ({
      id: row.id,
      whatsappMessageId: row.whatsappMessageId,
      direction: row.direction === "OUTBOUND" ? "OUTBOUND" : "INBOUND",
      messageType: row.messageType,
      status: row.status,
      text: messageText(row.payload, row.messageType),
      fromMe: row.fromMe,
      messageTimestamp: row.messageTimestamp,
    }));
    const queued: ConversationMessageRecord[] = outboxRows.map((row) => ({
      id: `outbox:${row.id}`,
      whatsappMessageId: "",
      direction: "OUTBOUND",
      messageType: "conversation",
      status: row.status,
      text: row.text,
      fromMe: true,
      messageTimestamp: row.createdAt,
    }));
    return [...messages, ...queued]
      .sort((left, right) => left.messageTimestamp.getTime() - right.messageTimestamp.getTime())
      .slice(-Math.min(Math.max(input.take, 1), 250));
  }
  async listNotes(tenantId: string, conversationId: string): Promise<ConversationNoteRecord[]> {
    const rows = await this.prisma.conversationNote.findMany({
      where: { tenantId, conversationId },
      include: { author: { select: { displayName: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return rows.map((row) => ({
      id: row.id,
      text: row.text,
      authorUserId: row.authorUserId,
      authorName: row.author.displayName,
      authorEmail: row.author.email,
      createdAt: row.createdAt,
    }));
  }

  async addNote(input: {
    tenantId: string;
    conversationId: string;
    authorUserId: string;
    text: string;
  }): Promise<ConversationNoteRecord> {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: input.conversationId, tenantId: input.tenantId },
      select: { id: true },
    });
    if (!conversation) throw new Error("Conversación no encontrada.");
    const row = await this.prisma.conversationNote.create({
      data: input,
      include: { author: { select: { displayName: true, email: true } } },
    });
    return {
      id: row.id,
      text: row.text,
      authorUserId: row.authorUserId,
      authorName: row.author.displayName,
      authorEmail: row.author.email,
      createdAt: row.createdAt,
    };
  }

  async updateProfile(input: {
    tenantId: string;
    conversationId: string;
    displayName?: string;
    tags?: string[];
  }): Promise<void> {
    const result = await this.prisma.conversation.updateMany({
      where: { id: input.conversationId, tenantId: input.tenantId },
      data: {
        ...(input.displayName !== undefined ? { displayName: input.displayName || null } : {}),
        ...(input.tags !== undefined ? { tagsPayload: encodeJson(input.tags.slice(0, 20)) } : {}),
      },
    });
    if (result.count !== 1) throw new Error("Conversación no encontrada.");
  }

  async markRead(tenantId: string, conversationId: string): Promise<void> {
    await this.prisma.conversation.updateMany({
      where: { id: conversationId, tenantId },
      data: { unreadCount: 0, lastReadAt: new Date() },
    });
  }

  async setClosed(tenantId: string, conversationId: string, closed: boolean): Promise<void> {
    const result = await this.prisma.conversation.updateMany({
      where: { id: conversationId, tenantId },
      data: closed
        ? { status: "CLOSED", closedAt: new Date(), unreadCount: 0 }
        : { status: "OPEN", closedAt: null },
    });
    if (result.count !== 1) throw new Error("Conversación no encontrada.");
  }

  async enqueueText(input: {
    tenantId: string;
    conversationId: string;
    actorUserId: string;
    text: string;
  }): Promise<string> {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: input.conversationId, tenantId: input.tenantId },
      include: { session: { select: { status: true } } },
    });
    if (!conversation) throw new Error("Conversación no encontrada.");
    if (conversation.status === "CLOSED") throw new Error("La conversación está cerrada.");
    if (conversation.isBotActive) throw new Error("Toma la conversación antes de responder manualmente.");
    if (conversation.session.status !== "CONNECTED") throw new Error("La sesión de WhatsApp no está conectada.");
    const row = await this.prisma.conversationOutbox.create({
      data: {
        tenantId: input.tenantId,
        conversationId: input.conversationId,
        sessionId: conversation.sessionId,
        remoteJid: conversation.remoteJid,
        actorUserId: input.actorUserId,
        text: input.text,
      },
    });
    return row.id;
  }


  async enqueueDirectText(input: {
    tenantId: string;
    sessionId: string;
    actorUserId: string;
    phoneE164: string;
    displayName?: string;
    text: string;
  }): Promise<{ conversationId: string; outboxId: string }> {
    const phoneDigits = input.phoneE164.replace(/\D/g, "");
    if (phoneDigits.length < 8 || phoneDigits.length > 15) {
      throw new Error("Número de destino inválido.");
    }

    const session = await this.prisma.whatsAppSession.findFirst({
      where: {
        id: input.sessionId,
        tenantId: input.tenantId,
        deletedAt: null,
      },
      select: {
        id: true,
        status: true,
        phoneE164: true,
      },
    });

    if (!session) throw new Error("Sesión de WhatsApp no encontrada.");
    if (session.status !== "CONNECTED") {
      if (session.status === "QUARANTINED") {
        throw new Error("La sesión está en cuarentena y no puede enviar mensajes.");
      }
      throw new Error(`La sesión de WhatsApp no está conectada (${session.status}).`);
    }

    const sessionDigits = session.phoneE164?.replace(/\D/g, "") ?? "";
    if (sessionDigits && sessionDigits === phoneDigits) {
      throw new Error("No puedes enviar un mensaje al mismo número de la sesión.");
    }

    const remoteJid = `${phoneDigits}@s.whatsapp.net`;
    const phoneE164 = `+${phoneDigits}`;
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const conversation = await tx.conversation.upsert({
        where: {
          sessionId_remoteJid: {
            sessionId: input.sessionId,
            remoteJid,
          },
        },
        create: {
          tenantId: input.tenantId,
          sessionId: input.sessionId,
          remoteJid,
          phoneE164,
          displayName: input.displayName,
          status: "OPEN",
          unreadCount: 0,
          isBotActive: false,
          humanModeSince: now,
          assignedAgentId: input.actorUserId,
          lastMessageAt: now,
        },
        update: {
          phoneE164,
          ...(input.displayName ? { displayName: input.displayName } : {}),
          status: "OPEN",
          closedAt: null,
          isBotActive: false,
          humanModeSince: now,
          assignedAgentId: input.actorUserId,
          lastMessageAt: now,
        },
      });

      const outbox = await tx.conversationOutbox.create({
        data: {
          tenantId: input.tenantId,
          conversationId: conversation.id,
          sessionId: input.sessionId,
          remoteJid,
          actorUserId: input.actorUserId,
          text: input.text,
        },
      });

      return { conversationId: conversation.id, outboxId: outbox.id };
    });
  }

  async claimNextOutbox(input: {
    sessionId: string;
    workerId: string;
    lockExpiresAt: Date;
  }): Promise<ConversationOutboxRecord | null> {
    const now = new Date();
    await this.prisma.conversationOutbox.updateMany({
      where: { sessionId: input.sessionId, status: "PROCESSING", lockExpiresAt: { lt: now } },
      data: { status: "PENDING", processingAt: null, lockedBy: null, lockExpiresAt: null, availableAt: now },
    });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = await this.prisma.conversationOutbox.findFirst({
        where: {
          sessionId: input.sessionId,
          status: "PENDING",
          availableAt: { lte: now },
          OR: [{ lockExpiresAt: null }, { lockExpiresAt: { lt: now } }],
        },
        orderBy: { createdAt: "asc" },
      });
      if (!candidate) return null;
      const updated = await this.prisma.conversationOutbox.updateMany({
        where: { id: candidate.id, status: "PENDING" },
        data: {
          status: "PROCESSING",
          processingAt: now,
          lockedBy: input.workerId,
          lockExpiresAt: input.lockExpiresAt,
          attemptCount: { increment: 1 },
        },
      });
      if (updated.count === 1) {
        const row = await this.prisma.conversationOutbox.findUniqueOrThrow({ where: { id: candidate.id } });
        return {
          id: row.id,
          tenantId: row.tenantId,
          conversationId: row.conversationId,
          sessionId: row.sessionId,
          remoteJid: row.remoteJid,
          actorUserId: row.actorUserId,
          text: row.text,
          status: row.status,
          attemptCount: row.attemptCount,
          maxAttempts: row.maxAttempts,
        };
      }
    }
    return null;
  }

  async markOutboxSent(id: string, whatsappMessageId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.conversationOutbox.update({
        where: { id },
        data: {
          status: "SENT",
          whatsappMessageId,
          sentAt: new Date(),
          lockedBy: null,
          lockExpiresAt: null,
          lastErrorCode: null,
          lastErrorMessage: null,
        },
      }),
      this.prisma.conversation.updateMany({
        where: { outboxItems: { some: { id } } },
        data: { lastOutboundMessageId: whatsappMessageId, lastMessageAt: new Date() },
      }),
    ]);
  }

  async markOutboxFailed(input: {
    id: string;
    code: string;
    message: string;
    retryAt: Date;
  }): Promise<void> {
    const row = await this.prisma.conversationOutbox.findUniqueOrThrow({ where: { id: input.id } });
    const dead = row.attemptCount >= row.maxAttempts;
    await this.prisma.conversationOutbox.update({
      where: { id: input.id },
      data: dead
        ? {
            status: "FAILED",
            failedAt: new Date(),
            lockedBy: null,
            lockExpiresAt: null,
            lastErrorCode: input.code,
            lastErrorMessage: input.message.slice(0, 2000),
          }
        : {
            status: "PENDING",
            availableAt: input.retryAt,
            processingAt: null,
            lockedBy: null,
            lockExpiresAt: null,
            lastErrorCode: input.code,
            lastErrorMessage: input.message.slice(0, 2000),
          },
    });
  }

  async setHumanMode(input: {
    conversationId: string;
    tenantId: string;
    active: boolean;
    agentId?: string;
  }): Promise<void> {
    const result = await this.prisma.conversation.updateMany({
      where: { id: input.conversationId, tenantId: input.tenantId },
      data: input.active
        ? { isBotActive: false, assignedAgentId: input.agentId, humanModeSince: new Date(), status: "OPEN", closedAt: null }
        : { isBotActive: true, assignedAgentId: null, humanModeSince: null },
    });
    if (result.count !== 1) throw new Error("Conversación no encontrada.");
  }

  async saveFlowState(conversationId: string, state: ConversationFlowState): Promise<void> {
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        flowId: state.flowId,
        flowNodeId: String(state.nodeIndex),
        flowAwaitingVariable: state.awaitingVariable ?? null,
        flowVariablesPayload: encodeJson(state.variables),
        flowUpdatedAt: new Date(),
      },
    });
  }

  async clearFlowState(conversationId: string): Promise<void> {
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        flowId: null,
        flowNodeId: null,
        flowAwaitingVariable: null,
        flowVariablesPayload: null,
        flowUpdatedAt: new Date(),
      },
    });
  }
}
