import crypto from "node:crypto";
import path from "node:path";
import type { IMediaAssetRepository, MediaKind } from "../ports/repositories/media.repository.js";
import type { IObjectStorage } from "../ports/storage/object-storage.js";
import { HttpError } from "../../shared/errors/http-error.js";

interface UploadIntentPayload {
  assetId: string;
  tenantId: string;
  objectKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  expiresAt: number;
}

export class MediaAssetService {
  constructor(
    private readonly media: IMediaAssetRepository,
    private readonly storage: IObjectStorage,
    private readonly tokenSecret: string,
    private readonly maxBytes: number,
    private readonly uploadUrlSeconds: number,
  ) {}

  async upload(input: { tenantId: string; originalName: string; mimeType: string; body: Buffer }) {
    this.validateNameAndSize(input.originalName, input.body.length);
    const prefix = input.body.subarray(0, 512);
    const mimeType = this.resolveUploadedMimeType(input.mimeType, prefix);
    const kind = this.detectKind(mimeType);
    const assetId = crypto.randomUUID();
    const objectKey = this.buildObjectKey(input.tenantId, input.originalName, assetId);
    const sha256 = crypto.createHash("sha256").update(input.body).digest("hex");

    await this.storage.putObject({ key: objectKey, body: input.body, contentType: mimeType });
    return this.media.create({
      id: assetId,
      tenantId: input.tenantId,
      fileName: input.originalName,
      mimeType,
      mediaKind: kind,
      sizeBytes: input.body.length,
      sha256,
      sourceObjectKey: objectKey,
    });
  }

  async createDirectUploadIntent(input: {
    tenantId: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
  }) {
    this.validateDeclaredFile(input.originalName, input.mimeType, input.sizeBytes);
    const assetId = crypto.randomUUID();
    const objectKey = this.buildObjectKey(input.tenantId, input.originalName, assetId);
    const expiresAt = Date.now() + this.uploadUrlSeconds * 1000;
    const payload: UploadIntentPayload = { assetId, ...input, objectKey, expiresAt };
    return {
      uploadUrl: await this.storage.createSignedWriteUrl(objectKey, input.mimeType, this.uploadUrlSeconds),
      uploadToken: this.signPayload(payload),
      objectKey,
      expiresAt: new Date(expiresAt).toISOString(),
      requiredHeaders: {
        "Content-Type": input.mimeType,
        "x-amz-server-side-encryption": "AES256",
      },
    };
  }

  async confirmDirectUpload(tenantId: string, uploadToken: string) {
    const payload = this.verifyPayload(uploadToken);
    if (payload.tenantId !== tenantId) throw new HttpError(403, "La carga no pertenece al tenant autenticado.");
    if (payload.expiresAt < Date.now()) throw new HttpError(410, "La intención de carga venció.");

    try {
      const metadata = await this.storage.headObject(payload.objectKey);
      if (metadata.sizeBytes !== payload.sizeBytes) {
        throw new HttpError(400, `El tamaño recibido (${metadata.sizeBytes}) no coincide con el declarado (${payload.sizeBytes}).`);
      }
      if (metadata.sizeBytes <= 0 || metadata.sizeBytes > this.maxBytes) {
        throw new HttpError(400, "El tamaño del archivo está fuera del límite permitido.");
      }
      if (metadata.contentType && metadata.contentType !== payload.mimeType) {
        throw new HttpError(400, "El Content-Type almacenado no coincide con el solicitado.");
      }
      const prefix = await this.storage.readObjectPrefix(payload.objectKey, 512);
      this.validateMagicBytes(payload.mimeType, prefix);
      return await this.media.create({
        id: payload.assetId,
        tenantId,
        fileName: payload.originalName,
        mimeType: payload.mimeType,
        mediaKind: this.detectKind(payload.mimeType),
        sizeBytes: metadata.sizeBytes,
        sourceObjectKey: payload.objectKey,
      });
    } catch (error) {
      if (error instanceof HttpError) {
        await this.storage.deleteObject(payload.objectKey).catch(() => undefined);
        throw error;
      }
      throw new HttpError(400, "No se pudo verificar el objeto cargado en S3.");
    }
  }

  list(tenantId: string) {
    return this.media.listByTenant(tenantId);
  }

  private buildObjectKey(tenantId: string, originalName: string, assetId: string): string {
    const safeExtension = path.extname(originalName).toLowerCase().replace(/[^a-z0-9.]/g, "").slice(0, 12);
    const day = new Date().toISOString().slice(0, 10);
    return `temporary/tenants/${tenantId}/${day}/${assetId}${safeExtension}`;
  }

  private validateNameAndSize(originalName: string, sizeBytes: number): void {
    if (!originalName.trim() || originalName.length > 191) throw new HttpError(400, "Nombre de archivo inválido.");
    if (!Number.isInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > this.maxBytes) {
      throw new HttpError(400, `El archivo debe pesar entre 1 byte y ${this.maxBytes} bytes.`);
    }
  }

  private validateDeclaredFile(originalName: string, mimeType: string, sizeBytes: number): void {
    this.validateNameAndSize(originalName, sizeBytes);
    this.detectKind(mimeType);
  }

  private resolveUploadedMimeType(declaredMimeType: string, bytes: Buffer): string {
    const detected = this.detectMimeFromBytes(bytes, declaredMimeType);
    if (!detected) {
      throw new HttpError(400, `No se pudo reconocer el contenido del archivo declarado como ${declaredMimeType || "desconocido"}.`);
    }
    return detected;
  }

  private detectMimeFromBytes(bytes: Buffer, declaredMimeType: string): string | undefined {
    const starts = (...values: number[]) => values.every((value, index) => bytes[index] === value);
    const ascii = bytes.toString("ascii", 0, 16);

    if (starts(0xff, 0xd8, 0xff)) return "image/jpeg";
    if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
    if (ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP") return "image/webp";
    if (ascii.startsWith("%PDF-")) return "application/pdf";
    if (ascii.slice(4, 8) === "ftyp") return declaredMimeType.startsWith("video/") ? declaredMimeType : "video/mp4";
    if (ascii.startsWith("OggS")) return declaredMimeType.startsWith("audio/") ? declaredMimeType : "audio/ogg";
    if (ascii.startsWith("ID3") || starts(0xff, 0xfb) || starts(0xff, 0xf3)) {
      return declaredMimeType.startsWith("audio/") ? declaredMimeType : "audio/mpeg";
    }
    if (ascii.startsWith("RIFF")) return declaredMimeType.startsWith("audio/") ? declaredMimeType : "audio/wav";
    if (declaredMimeType.startsWith("text/") && !bytes.includes(0)) return declaredMimeType;
    return undefined;
  }

  private signPayload(payload: UploadIntentPayload): string {
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = crypto.createHmac("sha256", this.tokenSecret).update(encoded).digest("base64url");
    return `${encoded}.${signature}`;
  }

  private verifyPayload(token: string): UploadIntentPayload {
    const [encoded, supplied] = token.split(".");
    if (!encoded || !supplied) throw new HttpError(400, "Token de carga inválido.");
    const expected = crypto.createHmac("sha256", this.tokenSecret).update(encoded).digest();
    const suppliedBuffer = Buffer.from(supplied, "base64url");
    if (expected.length !== suppliedBuffer.length || !crypto.timingSafeEqual(expected, suppliedBuffer)) {
      throw new HttpError(400, "Firma de carga inválida.");
    }
    try {
      return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as UploadIntentPayload;
    } catch {
      throw new HttpError(400, "Contenido del token de carga inválido.");
    }
  }

  private validateMagicBytes(mimeType: string, bytes: Buffer): void {
    const starts = (...values: number[]) => values.every((value, index) => bytes[index] === value);
    const ascii = bytes.toString("ascii", 0, 16);
    const valid =
      (mimeType === "image/jpeg" && starts(0xff, 0xd8, 0xff)) ||
      (mimeType === "image/png" && starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) ||
      (mimeType === "image/webp" && ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP") ||
      (mimeType === "application/pdf" && ascii.startsWith("%PDF-")) ||
      (mimeType.startsWith("video/") && ascii.slice(4, 8) === "ftyp") ||
      (mimeType.startsWith("audio/") && (ascii.startsWith("ID3") || ascii.startsWith("OggS") || ascii.startsWith("RIFF") || starts(0xff, 0xfb) || starts(0xff, 0xf3))) ||
      (mimeType.startsWith("text/") && !bytes.includes(0));
    if (!valid) throw new HttpError(400, `La firma del archivo no coincide con ${mimeType}.`);
  }

  private detectKind(mimeType: string): MediaKind {
    if (mimeType.startsWith("image/")) return mimeType === "image/webp" ? "STICKER" : "IMAGE";
    if (mimeType.startsWith("video/")) return "VIDEO";
    if (mimeType.startsWith("audio/")) return "AUDIO";
    if (mimeType === "application/pdf" || mimeType.startsWith("text/")) return "DOCUMENT";
    throw new HttpError(400, `Tipo de archivo no soportado: ${mimeType}`);
  }
}
