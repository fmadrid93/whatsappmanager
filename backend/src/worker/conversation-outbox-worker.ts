import { getContentType, proto } from "@whiskeysockets/baileys";
import type { IConversationRepository } from "../application/ports/repositories/conversation.repository.js";
import type { IWhatsAppMessageRepository } from "../application/ports/repositories/whatsapp-message.repository.js";
import type { IWhatsAppSocketRegistry } from "../application/ports/whatsapp/socket-registry.js";
import { classifySendFailure } from "../domain/queue/send-error-classifier.js";
import { retryDelaySeconds } from "../domain/queue/retry-policy.js";
import { logger } from "../shared/logger/logger.js";

export class ConversationOutboxWorker {
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly conversations: IConversationRepository,
    private readonly messages: IWhatsAppMessageRepository,
    private readonly sockets: IWhatsAppSocketRegistry,
    private readonly workerId: string,
    private readonly lockSeconds: number,
    private readonly intervalMs: number,
  ) {}

  start(): void {
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  async stopAndWait(timeoutMs: number): Promise<void> {
    this.stop();
    const deadline = Date.now() + timeoutMs;
    while (this.running && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (this.running) throw new Error(`El worker de conversaciones no terminó dentro de ${timeoutMs} ms.`);
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await Promise.all(this.sockets.ids().map((sessionId) => this.processOne(sessionId)));
    } finally {
      this.running = false;
    }
  }

  private async processOne(sessionId: string): Promise<void> {
    const item = await this.conversations.claimNextOutbox({
      sessionId,
      workerId: this.workerId,
      lockExpiresAt: new Date(Date.now() + this.lockSeconds * 1000),
    });
    if (!item) return;

    try {
      const socket = this.sockets.get(sessionId);
      const sent = await socket.sendMessage(item.remoteJid, { text: item.text });
      if (!sent?.key.id) throw new Error("WhatsApp no devolvió identificador para la respuesta manual.");

      if (sent.message) {
        await this.messages.save({
          tenantId: item.tenantId,
          sessionId: item.sessionId,
          conversationId: item.conversationId,
          whatsappMessageId: sent.key.id,
          remoteJid: item.remoteJid,
          direction: "OUTBOUND",
          messageType: getContentType(sent.message) ?? "conversation",
          status: "SUBMITTED",
          fromMe: true,
          payload: Buffer.from(proto.Message.encode(sent.message).finish()),
          messageTimestamp: new Date(),
        });
      }

      await this.conversations.markOutboxSent(item.id, sent.key.id);
    } catch (error) {
      const failure = classifySendFailure(error);
      const retrySeconds = retryDelaySeconds(item.attemptCount);
      await this.conversations.markOutboxFailed({
        id: item.id,
        code: failure.code,
        message: failure.message,
        retryAt: new Date(Date.now() + retrySeconds * 1000),
      });
      logger.error({ error, conversationOutboxId: item.id, sessionId }, "No se pudo enviar la respuesta manual.");
    }
  }
}
