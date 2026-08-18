import {
  generateWAMessageFromContent,
  getContentType,
  jidNormalizedUser,
  normalizeMessageContent,
  proto,
  type WASocket,
} from "@whiskeysockets/baileys";
import type {
  IMediaAssetRepository,
  IPreparedMediaRepository,
  MediaAssetRecord,
} from "../ports/repositories/media.repository.js";
import type { IObjectStorage } from "../ports/storage/object-storage.js";
import type { ICryptoBox } from "../ports/crypto/crypto-box.js";
import type { IWhatsAppSocketRegistry } from "../ports/whatsapp/socket-registry.js";

interface StoredMetadata {
  version: number;
  mediaType: string;
  url?: string;
  directPath?: string;
  mediaKeyBase64?: string;
  fileSha256Base64?: string;
  fileEncSha256Base64?: string;
  mimetype?: string;
  fileName?: string;
  preparedAt: string;
}

export class MediaReuseService {
  constructor(
    private readonly assets: IMediaAssetRepository,
    private readonly prepared: IPreparedMediaRepository,
    private readonly storage: IObjectStorage,
    private readonly crypto: ICryptoBox,
    private readonly sockets: IWhatsAppSocketRegistry,
    private readonly signedUrlSeconds: number,
  ) {}

  /**
   * Realiza el pre-upload para una sesión concreta. Esto permite que distintos
   * workers preparen, de forma distribuida, las sesiones de la misma campaña.
   */
  async prepareForSession(mediaAssetId: string, sessionId: string): Promise<void> {
    const existing = await this.prepared.find(mediaAssetId, sessionId);
    if (existing && (!existing.expiresAt || existing.expiresAt > new Date())) return;

    const asset = await this.assets.findById(mediaAssetId);
    if (!asset) throw new Error("Archivo multimedia no encontrado.");
    if (!asset.sourceObjectKey) {
      throw new Error("El archivo temporal ya fue eliminado y esta sesión aún no fue preparada.");
    }

    const signedUrl = await this.storage.createSignedReadUrl(
      asset.sourceObjectKey,
      this.signedUrlSeconds,
    );
    const socket = this.sockets.get(sessionId);
    await this.prepareOne(asset, sessionId, socket, signedUrl);
  }

  /**
   * Se ejecuta únicamente cuando todas las sesiones de failover ya tienen sus
   * llaves persistidas. El borrado AWS S3 es idempotente.
   */
  async finalizeAsset(mediaAssetId: string): Promise<void> {
    const asset = await this.assets.findById(mediaAssetId);
    if (!asset) throw new Error("Archivo multimedia no encontrado.");

    if (!asset.sourceObjectKey) {
      await this.assets.markPrepared(asset.id);
      return;
    }

    try {
      await this.storage.deleteObject(asset.sourceObjectKey);
      await this.assets.markSourceDeleted(asset.id, new Date());
      await this.assets.markPrepared(asset.id);
    } catch (error) {
      await this.assets.markCleanupPending(
        asset.id,
        error instanceof Error ? error.message : "No se pudo eliminar el archivo temporal.",
      );
      throw error;
    }
  }

  async sendPrepared(input: {
    mediaAssetId: string;
    sessionId: string;
    destinationJid: string;
    caption?: string;
    clientMessageId: string;
  }): Promise<string> {
    const record = await this.prepared.find(input.mediaAssetId, input.sessionId);
    if (!record) throw new Error("La multimedia no fue preparada para esta sesión.");
    if (record.expiresAt && record.expiresAt <= new Date()) {
      throw new Error("La referencia multimedia venció y debe prepararse nuevamente.");
    }

    const socket = this.sockets.get(input.sessionId);
    if (!socket.user?.id) throw new Error("La sesión no está conectada.");

    const decoded = proto.Message.decode(this.crypto.decrypt(record.protoPayload));
    const content = proto.Message.fromObject(proto.Message.toObject(decoded)) as proto.IMessage;
    const contentMap = content as unknown as Record<string, unknown>;
    const mediaNode = contentMap[record.mediaType] as Record<string, unknown> | undefined;
    if (!mediaNode) throw new Error(`El proto preparado no contiene ${record.mediaType}.`);
    if (input.caption !== undefined && "caption" in mediaNode) mediaNode.caption = input.caption;

    const outgoing = generateWAMessageFromContent(input.destinationJid, content, {
      userJid: jidNormalizedUser(socket.user.id),
      messageId: input.clientMessageId,
    });
    if (!outgoing.message || !outgoing.key.id) {
      throw new Error("No se pudo generar el mensaje multimedia.");
    }

    await socket.relayMessage(input.destinationJid, outgoing.message, {
      messageId: outgoing.key.id,
    });
    await this.prepared.touch(input.mediaAssetId, input.sessionId);
    return outgoing.key.id;
  }

  private async prepareOne(
    asset: MediaAssetRecord,
    sessionId: string,
    socket: WASocket,
    signedUrl: string,
  ): Promise<void> {
    if (!socket.user?.id) throw new Error(`La sesión ${sessionId} no está conectada.`);
    const selfJid = jidNormalizedUser(socket.user.id);
    const ghost = await socket.sendMessage(
      selfJid,
      this.buildContent(asset, signedUrl) as never,
    );
    if (!ghost?.message || !ghost.key.id) {
      throw new Error("Baileys no devolvió el envío fantasma.");
    }

    const normalized = normalizeMessageContent(ghost.message) ?? ghost.message;
    const mediaType = getContentType(normalized);
    if (!mediaType) throw new Error("No se pudo identificar el tipo multimedia preparado.");
    const node = (normalized as unknown as Record<string, unknown>)[mediaType] as
      | Record<string, unknown>
      | undefined;
    if (!node) throw new Error("No se encontraron metadatos multimedia.");

    const metadata: StoredMetadata = {
      version: 1,
      mediaType,
      url: this.stringValue(node.url),
      directPath: this.stringValue(node.directPath),
      mediaKeyBase64: this.base64Value(node.mediaKey),
      fileSha256Base64: this.base64Value(node.fileSha256),
      fileEncSha256Base64: this.base64Value(node.fileEncSha256),
      mimetype: this.stringValue(node.mimetype),
      fileName: this.stringValue(node.fileName),
      preparedAt: new Date().toISOString(),
    };

    await this.prepared.upsert({
      mediaAssetId: asset.id,
      sessionId,
      mediaType,
      protoPayload: this.crypto.encrypt(Buffer.from(proto.Message.encode(normalized).finish())),
      metadataPayload: this.crypto.encrypt(Buffer.from(JSON.stringify(metadata), "utf8")),
      sourceMessageId: ghost.key.id,
    });

    // Limpia el mensaje visible enviado a la propia cuenta. Si falla, la
    // preparación sigue siendo válida porque las llaves ya se persistieron.
    void socket.sendMessage(selfJid, { delete: ghost.key }).catch(() => undefined);
  }

  private buildContent(asset: MediaAssetRecord, url: string): Record<string, unknown> {
    switch (asset.mediaKind) {
      case "IMAGE":
        return { image: { url }, mimetype: asset.mimeType, caption: "Preparando multimedia" };
      case "VIDEO":
        return { video: { url }, mimetype: asset.mimeType, caption: "Preparando multimedia" };
      case "AUDIO":
        return { audio: { url }, mimetype: asset.mimeType, ptt: false };
      case "DOCUMENT":
        return { document: { url }, mimetype: asset.mimeType, fileName: asset.fileName };
      case "STICKER":
        return { sticker: { url }, mimetype: asset.mimeType };
    }
  }

  private stringValue(value: unknown): string | undefined {
    return typeof value === "string" ? value : undefined;
  }

  private base64Value(value: unknown): string | undefined {
    return value instanceof Uint8Array ? Buffer.from(value).toString("base64") : undefined;
  }
}
