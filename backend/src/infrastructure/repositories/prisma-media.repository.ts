import type { MediaAsset, MediaUpload, PrismaClient } from "@prisma/client";
import type {
  IMediaAssetRepository,
  IPreparedMediaRepository,
  MediaAssetRecord,
  MediaKind,
  PreparedMediaRecord,
} from "../../application/ports/repositories/media.repository.js";
import { toPrismaBytes } from "../../shared/utils/json-buffer.js";

function mapAsset(row: MediaAsset): MediaAssetRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    fileName: row.fileName,
    mimeType: row.mimeType,
    mediaKind: row.mediaKind as MediaKind,
    sizeBytes: row.sizeBytes ?? undefined,
    sourceObjectKey: row.sourceObjectKey ?? undefined,
    status: row.status,
  };
}

function mapPrepared(row: MediaUpload): PreparedMediaRecord {
  return {
    id: row.id,
    mediaAssetId: row.mediaAssetId,
    sessionId: row.sessionId,
    mediaType: row.mediaType,
    protoPayload: Buffer.from(row.protoPayload),
    metadataPayload: Buffer.from(row.metadataPayload),
    sourceMessageId: row.sourceMessageId ?? undefined,
    preparedAt: row.preparedAt,
    expiresAt: row.expiresAt ?? undefined,
  };
}

export class PrismaMediaAssetRepository implements IMediaAssetRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: {
    id?: string;
    tenantId: string;
    fileName: string;
    mimeType: string;
    mediaKind: MediaKind;
    sizeBytes: number;
    sha256?: string;
    sourceObjectKey: string;
  }): Promise<MediaAssetRecord> {
    if (input.id) {
      return mapAsset(await this.prisma.mediaAsset.upsert({
        where: { id: input.id },
        create: input,
        update: {},
      }));
    }
    return mapAsset(await this.prisma.mediaAsset.create({ data: input }));
  }

  async listByTenant(tenantId: string): Promise<MediaAssetRecord[]> {
    const rows = await this.prisma.mediaAsset.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(mapAsset);
  }

  async findById(id: string): Promise<MediaAssetRecord | null> {
    const row = await this.prisma.mediaAsset.findUnique({ where: { id } });
    return row ? mapAsset(row) : null;
  }

  async markPrepared(id: string): Promise<void> {
    await this.prisma.mediaAsset.update({ where: { id }, data: { status: "PREPARED" } });
  }

  async markSourceDeleted(id: string, deletedAt: Date): Promise<void> {
    await this.prisma.mediaAsset.update({
      where: { id },
      data: { sourceObjectKey: null, sourceDeletedAt: deletedAt, cleanupError: null },
    });
  }

  async markCleanupPending(id: string, error: string): Promise<void> {
    await this.prisma.mediaAsset.update({
      where: { id },
      data: { status: "CLEANUP_PENDING", cleanupError: error.slice(0, 900) },
    });
  }
}

export class PrismaPreparedMediaRepository implements IPreparedMediaRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async find(mediaAssetId: string, sessionId: string): Promise<PreparedMediaRecord | null> {
    const row = await this.prisma.mediaUpload.findUnique({
      where: { mediaAssetId_sessionId: { mediaAssetId, sessionId } },
    });
    return row ? mapPrepared(row) : null;
  }

  async upsert(input: {
    mediaAssetId: string;
    sessionId: string;
    mediaType: string;
    protoPayload: Buffer;
    metadataPayload: Buffer;
    sourceMessageId?: string;
    expiresAt?: Date;
  }): Promise<PreparedMediaRecord> {
    const protoPayload = toPrismaBytes(input.protoPayload);
    const metadataPayload = toPrismaBytes(input.metadataPayload);
    const row = await this.prisma.mediaUpload.upsert({
      where: { mediaAssetId_sessionId: { mediaAssetId: input.mediaAssetId, sessionId: input.sessionId } },
      create: {
        mediaAssetId: input.mediaAssetId,
        sessionId: input.sessionId,
        mediaType: input.mediaType,
        protoPayload,
        metadataPayload,
        sourceMessageId: input.sourceMessageId,
        expiresAt: input.expiresAt,
      },
      update: {
        mediaType: input.mediaType,
        protoPayload,
        metadataPayload,
        sourceMessageId: input.sourceMessageId,
        expiresAt: input.expiresAt,
        preparedAt: new Date(),
      },
    });
    return mapPrepared(row);
  }

  async touch(mediaAssetId: string, sessionId: string): Promise<void> {
    await this.prisma.mediaUpload.update({
      where: { mediaAssetId_sessionId: { mediaAssetId, sessionId } },
      data: { lastUsedAt: new Date() },
    });
  }
}
