import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { IObjectStorage } from "../../application/ports/storage/object-storage.js";

export class S3ObjectStorage implements IObjectStorage {
  private readonly client: S3Client;

  constructor(
    private readonly bucket: string,
    config: {
      endpoint?: string;
      region: string;
      forcePathStyle: boolean;
    },
  ) {
    const clientConfig: S3ClientConfig = {
      region: config.region,
      forcePathStyle: config.forcePathStyle,
    };

    // En AWS S3 real no se configura endpoint. El SDK construye el endpoint
    // correspondiente a la región y usa su cadena estándar de credenciales:
    // variables AWS_*, ~/.aws/credentials, ECS o IAM Role de EC2.
    if (config.endpoint) {
      clientConfig.endpoint = config.endpoint;
    }

    this.client = new S3Client(clientConfig);
  }

  async healthCheck(): Promise<void> {
    await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
  }

  async ensureBucket(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(
        `No se pudo acceder al bucket S3 "${this.bucket}". ` +
          `Créalo previamente y verifica AWS_REGION, credenciales e IAM. Detalle: ${reason}`,
      );
    }
  }

  async putObject(input: { key: string; body: Buffer; contentType: string }): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
        ServerSideEncryption: "AES256",
      }),
    );
  }

  async createSignedWriteUrl(key: string, contentType: string, expiresInSeconds: number): Promise<string> {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: contentType,
        ServerSideEncryption: "AES256",
      }),
      { expiresIn: expiresInSeconds },
    );
  }

  async headObject(key: string): Promise<{ sizeBytes: number; contentType?: string; eTag?: string }> {
    const result = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
    return {
      sizeBytes: Number(result.ContentLength ?? 0),
      contentType: result.ContentType,
      eTag: result.ETag?.replace(/"/g, ""),
    };
  }

  async readObjectPrefix(key: string, maxBytes: number): Promise<Buffer> {
    const result = await this.client.send(new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Range: `bytes=0-${Math.max(0, maxBytes - 1)}`,
    }));
    if (!result.Body) return Buffer.alloc(0);
    return Buffer.from(await result.Body.transformToByteArray());
  }

  async createSignedReadUrl(key: string, expiresInSeconds: number): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: expiresInSeconds },
    );
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
