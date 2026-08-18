import {
  getContentType,
  proto,
  type WAMessage,
  type WASocket,
} from "@whiskeysockets/baileys";
import type { ISessionRepository } from "../../application/ports/repositories/session.repository.js";
import type { IWhatsAppMessageRepository } from "../../application/ports/repositories/whatsapp-message.repository.js";
import type { IMessageAttemptRepository } from "../../application/ports/repositories/message-attempt.repository.js";
import { mapBaileysStatus } from "../../domain/messaging/message-status.js";
import { logger } from "../../shared/logger/logger.js";

function asDate(value: unknown): Date {
  let numeric = 0;
  if (typeof value === "number") numeric = value;
  else if (typeof value === "bigint") numeric = Number(value);
  else if (value && typeof value === "object" && "toNumber" in value) {
    numeric = (value as { toNumber: () => number }).toNumber();
  } else numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return new Date();
  return new Date(numeric < 1_000_000_000_000 ? numeric * 1000 : numeric);
}

function receiptDate(receipt: Record<string, unknown>): Date {
  return asDate(
    receipt.readTimestamp ??
      receipt.playedTimestamp ??
      receipt.receiptTimestamp ??
      receipt.deliveredTimestamp ??
      Date.now(),
  );
}

function receiptType(receipt: Record<string, unknown>): string {
  if (receipt.playedTimestamp) return "PLAYED";
  if (receipt.readTimestamp) return "READ";
  if (receipt.receiptTimestamp || receipt.deliveredTimestamp) return "DELIVERED";
  return "RECEIPT";
}


interface WhatsAppRestriction {
  code: number;
  message: string;
}

function detectWhatsAppRestriction(parameters: unknown): WhatsAppRestriction | null {
  if (!Array.isArray(parameters) || parameters.length === 0) return null;
  const values = parameters.map((value) => String(value ?? "").trim()).filter(Boolean);
  const code = Number.parseInt(values[0] ?? "", 10);
  const message = values.slice(1).join(" ").trim();

  if (code === 463) {
    return {
      code,
      message: message || "WhatsApp rechazó el envío automatizado con código 463.",
    };
  }

  return null;
}

export class BaileysMessagePersistenceHandler {
  constructor(
    private readonly sessions: ISessionRepository,
    private readonly messages: IWhatsAppMessageRepository,
    private readonly attempts: IMessageAttemptRepository,
  ) {}

  register(socket: WASocket, sessionId: string): void {
    socket.ev.on("messages.upsert", async ({ messages }: { messages: WAMessage[] }) => {
      for (const message of messages) {
        try {
          await this.persistMessage(sessionId, message);
        } catch (error) {
          logger.error({ error, sessionId, messageId: message.key.id }, "No se pudo persistir evento messages.upsert.");
        }
      }
    });

    socket.ev.on("messages.update", async (updates) => {
      for (const event of updates) {
        try {
          const messageId = event.key.id;
          if (!messageId) continue;
          const status = mapBaileysStatus(event.update.status);
          await this.messages.updateStatus(sessionId, messageId, status);
          await this.attempts.reconcileByMessageId(sessionId, messageId, status);
          const diagnosticUpdate = event.update as typeof event.update & {
            messageStubType?: unknown;
            messageStubParameters?: unknown;
          };
          logger.info(
            {
              sessionId,
              whatsappMessageId: messageId,
              remoteJid: event.key.remoteJid,
              participantJid: event.key.participant,
              status,
              rawStatus: event.update.status,
              messageStubType: diagnosticUpdate.messageStubType,
              messageStubParameters: diagnosticUpdate.messageStubParameters,
              updateKeys: Object.keys(event.update as object),
            },
            "ACK de WhatsApp recibido.",
          );

          const restriction = status === "FAILED"
            ? detectWhatsAppRestriction(diagnosticUpdate.messageStubParameters)
            : null;

          if (restriction) {
            const reason = `WHATSAPP_${restriction.code}_AUTOMATION_RESTRICTED: ${restriction.message}`;
            await this.sessions.quarantine(sessionId, reason, restriction.code);
            logger.error(
              {
                sessionId,
                whatsappMessageId: messageId,
                remoteJid: event.key.remoteJid,
                restrictionCode: restriction.code,
                restrictionMessage: restriction.message,
              },
              "WhatsApp restringió los envíos de esta sesión automatizada. El bot fue pausado y no se ejecutará failover automático.",
            );
          }
        } catch (error) {
          logger.error({ error, sessionId }, "No se pudo persistir messages.update.");
        }
      }
    });

    socket.ev.on("message-receipt.update", async (updates) => {
      for (const event of updates) {
        try {
          const messageId = event.key.id;
          if (!messageId) continue;
          const receipt = event.receipt as unknown as Record<string, unknown>;
          const type = receiptType(receipt);
          await this.messages.saveReceipt({
            sessionId,
            whatsappMessageId: messageId,
            receiptType: type,
            participantJid: event.key.participant ?? undefined,
            receiptAt: receiptDate(receipt),
          });
          await this.messages.updateStatus(sessionId, messageId, type);
          await this.attempts.reconcileByMessageId(sessionId, messageId, type);
          logger.info(
            {
              sessionId,
              whatsappMessageId: messageId,
              remoteJid: event.key.remoteJid,
              participantJid: event.key.participant,
              receiptType: type,
            },
            "Recibo de WhatsApp recibido.",
          );
        } catch (error) {
          logger.error({ error, sessionId }, "No se pudo persistir message-receipt.update.");
        }
      }
    });
  }

  private async persistMessage(sessionId: string, message: WAMessage): Promise<void> {
    const session = await this.sessions.findById(sessionId);
    const whatsappMessageId = message.key.id;
    const remoteJid = message.key.remoteJid;
    if (!session || !whatsappMessageId || !remoteJid || !message.message) return;

    const fromMe = message.key.fromMe === true;
    const status = mapBaileysStatus(message.status);
    await this.messages.save({
      tenantId: session.tenantId,
      sessionId,
      whatsappMessageId,
      remoteJid,
      participantJid: message.key.participant ?? undefined,
      direction: fromMe ? "OUTBOUND" : "INBOUND",
      messageType: getContentType(message.message) ?? "unknownMessage",
      status: fromMe ? status : "RECEIVED",
      fromMe,
      payload: Buffer.from(proto.Message.encode(message.message).finish()),
      messageTimestamp: asDate(message.messageTimestamp),
    });

    if (fromMe) {
      await this.attempts.reconcileByMessageId(sessionId, whatsappMessageId, status);
    }
  }
}
