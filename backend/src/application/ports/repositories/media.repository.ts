export type MediaKind = "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT" | "STICKER";

export interface MediaAssetRecord {
  id: string;
  tenantId: string;
  fileName: string;
  mimeType: string;
  mediaKind: MediaKind;
  sizeBytes?: number;
  sourceObjectKey?: string;
  status: string;
}

export interface PreparedMediaRecord {
  id: string;
  mediaAssetId: string;
  sessionId: string;
  mediaType: string;
  protoPayload: Buffer;
  metadataPayload: Buffer;
  sourceMessageId?: string;
  preparedAt: Date;
  expiresAt?: Date;
}

export interface IMediaAssetRepository {
  create(input: {
    id?: string;
    tenantId: string;
    fileName: string;
    mimeType: string;
    mediaKind: MediaKind;
    sizeBytes: number;
    sha256?: string;
    sourceObjectKey: string;
  }): Promise<MediaAssetRecord>;
  listByTenant(tenantId: string): Promise<MediaAssetRecord[]>;
  findById(id: string): Promise<MediaAssetRecord | null>;
  markPrepared(id: string): Promise<void>;
  markSourceDeleted(id: string, deletedAt: Date): Promise<void>;
  markCleanupPending(id: string, error: string): Promise<void>;
}

export interface IPreparedMediaRepository {
  find(mediaAssetId: string, sessionId: string): Promise<PreparedMediaRecord | null>;
  upsert(input: {
    mediaAssetId: string;
    sessionId: string;
    mediaType: string;
    protoPayload: Buffer;
    metadataPayload: Buffer;
    sourceMessageId?: string;
    expiresAt?: Date;
  }): Promise<PreparedMediaRecord>;
  touch(mediaAssetId: string, sessionId: string): Promise<void>;
}
