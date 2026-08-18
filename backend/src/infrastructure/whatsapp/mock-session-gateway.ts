import crypto from "node:crypto";
import { EventEmitter } from "node:events";
import type { WASocket } from "@whiskeysockets/baileys";
import type { ISessionRepository } from "../../application/ports/repositories/session.repository.js";
import type { IWhatsAppSocketRegistry } from "../../application/ports/whatsapp/socket-registry.js";
import type { ISessionGateway } from "../../application/ports/whatsapp/session-gateway.js";
import { logger } from "../../shared/logger/logger.js";

function mediaMessage(content: Record<string, unknown>): Record<string, unknown> {
  const bytes = () => crypto.randomBytes(32);
  if ("image" in content) return { imageMessage: { url: "mock://media/image", directPath: "/mock/image", mediaKey: bytes(), fileSha256: bytes(), fileEncSha256: bytes(), mimetype: String(content.mimetype ?? "image/jpeg"), caption: String(content.caption ?? "") } };
  if ("video" in content) return { videoMessage: { url: "mock://media/video", directPath: "/mock/video", mediaKey: bytes(), fileSha256: bytes(), fileEncSha256: bytes(), mimetype: String(content.mimetype ?? "video/mp4"), caption: String(content.caption ?? "") } };
  if ("audio" in content) return { audioMessage: { url: "mock://media/audio", directPath: "/mock/audio", mediaKey: bytes(), fileSha256: bytes(), fileEncSha256: bytes(), mimetype: String(content.mimetype ?? "audio/mpeg") } };
  if ("document" in content) return { documentMessage: { url: "mock://media/document", directPath: "/mock/document", mediaKey: bytes(), fileSha256: bytes(), fileEncSha256: bytes(), mimetype: String(content.mimetype ?? "application/octet-stream"), fileName: String(content.fileName ?? "archivo.bin") } };
  if ("sticker" in content) return { stickerMessage: { url: "mock://media/sticker", directPath: "/mock/sticker", mediaKey: bytes(), fileSha256: bytes(), fileEncSha256: bytes(), mimetype: String(content.mimetype ?? "image/webp") } };
  if ("delete" in content) return { protocolMessage: { key: content.delete, type: 0 } };
  return { conversation: String(content.text ?? "") };
}

function createMockSocket(sessionId: string): WASocket {
  const events = new EventEmitter();
  const userJid = `mock-${sessionId.replace(/-/g, "").slice(0, 12)}@s.whatsapp.net`;
  const socket = {
    user: { id: userJid, name: "Mock WhatsApp" },
    ev: events,
    onWhatsApp: async (...numbers: string[]) => numbers.map((number) => ({ exists: true, jid: `${number.replace(/\D/g, "")}@s.whatsapp.net` })),
    sendMessage: async (jid: string, content: Record<string, unknown>, options?: { messageId?: string }) => ({
      key: { remoteJid: jid, fromMe: true, id: options?.messageId ?? crypto.randomUUID() },
      message: mediaMessage(content),
      messageTimestamp: Math.floor(Date.now() / 1000),
    }),
    relayMessage: async () => undefined,
    readMessages: async () => undefined,
    sendPresenceUpdate: async () => undefined,
    end: () => undefined,
    logout: async () => undefined,
  };
  return socket as unknown as WASocket;
}

export class MockSessionGateway implements ISessionGateway {
  constructor(
    private readonly sessions: ISessionRepository,
    private readonly registry: IWhatsAppSocketRegistry,
    private readonly workerId: string,
  ) {}

  async start(sessionId: string): Promise<void> {
    if (this.registry.has(sessionId)) return;
    await this.sessions.updateStatus(sessionId, "CONNECTING");
    const socket = createMockSocket(sessionId);
    this.registry.set(sessionId, socket);
    const jid = String(socket.user?.id ?? `mock-${sessionId}@s.whatsapp.net`);
    const session = await this.sessions.findById(sessionId);
    await this.sessions.updateStatus(sessionId, "CONNECTED", {
      whatsappJid: jid,
      phoneE164: session?.expectedPhoneE164 ?? null,
      connectedAt: new Date(),
      disconnectReason: null,
      lastConnectionCode: 200,
      lastConnectionError: null,
      lastConnectionAt: new Date(),
      clearQr: true,
      clearPairingCode: true,
    });
    logger.info({ sessionId, workerId: this.workerId }, "Sesión mock conectada.");
  }

  async stop(sessionId: string): Promise<void> {
    this.registry.delete(sessionId);
    await this.sessions.releaseLease(sessionId, this.workerId);
  }

  async requestPairingCode(sessionId: string, phoneE164?: string): Promise<string> {
    const code = "1234-5678";
    await this.sessions.savePairingCode(sessionId, code);
    logger.info({ sessionId, phoneE164 }, "Código mock de vinculación generado.");
    return code;
  }
}
