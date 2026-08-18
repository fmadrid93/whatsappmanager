import assert from "node:assert/strict";
import test from "node:test";
import { MediaAssetService } from "../src/application/services/media-asset.service.js";

class FakeMediaRepository {
  created: any[] = [];
  async create(input: any) {
    this.created.push(input);
    return { ...input, status: "TEMPORARY" };
  }
  async listByTenant() { return []; }
  async findById() { return null; }
  async markPrepared() {}
  async markSourceDeleted() {}
  async markCleanupPending() {}
}

class FakeStorage {
  deleted: string[] = [];
  metadata = { sizeBytes: 8, contentType: "image/png" };
  prefix = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  async ensureBucket() {}
  async healthCheck() {}
  async putObject() {}
  async createSignedReadUrl() { return "https://read.example"; }
  async createSignedWriteUrl(key: string) { return `https://write.example/${key}`; }
  async headObject() { return this.metadata; }
  async readObjectPrefix() { return this.prefix; }
  async deleteObject(key: string) { this.deleted.push(key); }
}

test("crea y confirma una carga directa idempotente", async () => {
  const media = new FakeMediaRepository();
  const storage = new FakeStorage();
  const service = new MediaAssetService(media as any, storage as any, "a".repeat(48), 1024, 900);

  const intent = await service.createDirectUploadIntent({
    tenantId: "tenant-1",
    originalName: "foto.png",
    mimeType: "image/png",
    sizeBytes: 8,
  });

  assert.match(intent.objectKey, /^temporary\/tenants\/tenant-1\//);
  const result = await service.confirmDirectUpload("tenant-1", intent.uploadToken);
  assert.equal(result.mimeType, "image/png");
  assert.equal(media.created.length, 1);
  assert.equal(media.created[0].id, result.id);
});

test("elimina el objeto cuando la firma binaria no coincide", async () => {
  const media = new FakeMediaRepository();
  const storage = new FakeStorage();
  storage.prefix = Buffer.from("not-a-png");
  const service = new MediaAssetService(media as any, storage as any, "b".repeat(48), 1024, 900);
  const intent = await service.createDirectUploadIntent({
    tenantId: "tenant-1",
    originalName: "foto.png",
    mimeType: "image/png",
    sizeBytes: 8,
  });

  await assert.rejects(() => service.confirmDirectUpload("tenant-1", intent.uploadToken));
  assert.equal(storage.deleted.length, 1);
});
