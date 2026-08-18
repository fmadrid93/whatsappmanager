import { Prisma, type PrismaClient } from "@prisma/client";
import type {
  IWhatsAppMessageRepository,
  SaveMessageReceiptInput,
  SaveWhatsAppMessageInput,
} from "../../application/ports/repositories/whatsapp-message.repository.js";
import { toPrismaBytes } from "../../shared/utils/json-buffer.js";

export class PrismaWhatsAppMessageRepository implements IWhatsAppMessageRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async reserveInboundEvent(input: {
    tenantId: string;
    sessionId: string;
    whatsappMessageId: string;
  }): Promise<boolean> {
    try {
      await this.prisma.processedInboundEvent.create({ data: input });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return false;
      throw error;
    }
  }

  async releaseInboundEvent(sessionId: string, whatsappMessageId: string): Promise<void> {
    await this.prisma.processedInboundEvent.deleteMany({ where: { sessionId, whatsappMessageId } });
  }

  async setInboundResponse(sessionId: string, whatsappMessageId: string, responseMessageId: string): Promise<void> {
    await this.prisma.processedInboundEvent.updateMany({
      where: { sessionId, whatsappMessageId },
      data: { responseMessageId },
    });
  }

  async save(input: SaveWhatsAppMessageInput): Promise<void> {
    const payload = toPrismaBytes(input.payload);
    const where = {
      sessionId_whatsappMessageId: {
        sessionId: input.sessionId,
        whatsappMessageId: input.whatsappMessageId,
      },
    };
    const update = {
      conversationId: input.conversationId,
      campaignId: input.campaignId,
      queueItemId: input.queueItemId,
      remoteJid: input.remoteJid,
      participantJid: input.participantJid,
      direction: input.direction,
      messageType: input.messageType,
      status: input.status,
      fromMe: input.fromMe,
      payload,
      messageTimestamp: input.messageTimestamp,
    };

    try {
      await this.prisma.whatsAppMessage.upsert({
        where,
        create: {
          tenantId: input.tenantId,
          sessionId: input.sessionId,
          conversationId: input.conversationId,
          campaignId: input.campaignId,
          queueItemId: input.queueItemId,
          whatsappMessageId: input.whatsappMessageId,
          remoteJid: input.remoteJid,
          participantJid: input.participantJid,
          direction: input.direction,
          messageType: input.messageType,
          status: input.status,
          fromMe: input.fromMe,
          payload,
          messageTimestamp: input.messageTimestamp,
        },
        update,
      });
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error
        ? String((error as { code?: unknown }).code ?? "")
        : "";
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") && code !== "P2002") {
        throw error;
      }
      await this.prisma.whatsAppMessage.update({ where, data: update });
    }
  }

  async getMessagePayload(sessionId: string, whatsappMessageId: string): Promise<Buffer | null> {
    const row = await this.prisma.whatsAppMessage.findUnique({
      where: { sessionId_whatsappMessageId: { sessionId, whatsappMessageId } },
      select: { payload: true },
    });
    return row ? Buffer.from(row.payload) : null;
  }

  async exists(sessionId: string, whatsappMessageId: string): Promise<boolean> {
    return (await this.prisma.whatsAppMessage.count({
      where: { sessionId, whatsappMessageId },
    })) > 0;
  }

  async updateStatus(sessionId: string, whatsappMessageId: string, status: string): Promise<void> {
    await this.prisma.whatsAppMessage.updateMany({
      where: { sessionId, whatsappMessageId },
      data: { status },
    });
  }

  async saveReceipt(input: SaveMessageReceiptInput): Promise<void> {
    const message = await this.prisma.whatsAppMessage.findUnique({
      where: {
        sessionId_whatsappMessageId: {
          sessionId: input.sessionId,
          whatsappMessageId: input.whatsappMessageId,
        },
      },
      select: { id: true },
    });
    if (!message) return;
    await this.prisma.messageReceipt.create({
      data: {
        messageId: message.id,
        receiptType: input.receiptType,
        participantJid: input.participantJid,
        receiptAt: input.receiptAt,
        payload: input.payload ? toPrismaBytes(input.payload) : undefined,
      },
    });
  }
}
