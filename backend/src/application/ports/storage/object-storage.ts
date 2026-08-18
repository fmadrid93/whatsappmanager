export interface StoredObjectMetadata {
  sizeBytes: number;
  contentType?: string;
  eTag?: string;
}

export interface IObjectStorage {
  ensureBucket(): Promise<void>;
  healthCheck(): Promise<void>;
  putObject(input: { key: string; body: Buffer; contentType: string }): Promise<void>;
  createSignedReadUrl(key: string, expiresInSeconds: number): Promise<string>;
  createSignedWriteUrl(key: string, contentType: string, expiresInSeconds: number): Promise<string>;
  headObject(key: string): Promise<StoredObjectMetadata>;
  readObjectPrefix(key: string, maxBytes: number): Promise<Buffer>;
  deleteObject(key: string): Promise<void>;
}
