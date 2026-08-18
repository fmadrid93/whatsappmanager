import assert from "node:assert/strict";
import test from "node:test";
import { IntegrationValidationService } from "../src/application/services/integration-validation.service.js";

function createStorage() {
  const objects = new Map<string, Buffer>();
  return {
    ensureBucket: async () => undefined,
    healthCheck: async () => undefined,
    putObject: async ({ key, body }: { key: string; body: Buffer; contentType: string }) => { objects.set(key, Buffer.from(body)); },
    createSignedReadUrl: async () => "https://example.test/read",
    createSignedWriteUrl: async () => "https://example.test/write",
    headObject: async (key: string) => ({ sizeBytes: objects.get(key)?.length ?? 0, contentType: "text/plain" }),
    readObjectPrefix: async (key: string, maxBytes: number) => Buffer.from(objects.get(key) ?? Buffer.alloc(0)).subarray(0, maxBytes),
    deleteObject: async (key: string) => { objects.delete(key); },
  };
}

const connectedSession = {
  id: "11111111-1111-4111-8111-111111111111",
  tenantId: "tenant-1",
  ownerUserId: "user-1",
  name: "Principal",
  status: "CONNECTED",
  isBotActive: true,
  shardKey: 1,
};

test("integration probe passes with database, S3, worker and connected session", async () => {
  const service = new IntegrationValidationService(
    { ping: async () => undefined },
    createStorage() as never,
    { listByTenant: async () => [connectedSession] } as never,
    { listActive: async () => [{ id: "worker-1", shardId: 0, shardCount: 1, status: "ACTIVE", leaseExpiresAt: new Date(Date.now() + 60000) }] } as never,
    { whatsappGateway: "BAILEYS", objectStorage: "S3" },
  );

  const result = await service.run({
    tenantId: "tenant-1",
    sessionId: connectedSession.id,
    requireConnectedSession: true,
    performStorageRoundTrip: true,
  });

  assert.equal(result.decision, "PASS");
  assert.equal(result.checks.storage.roundTripVerified, true);
  assert.equal(result.checks.workers.activeCount, 1);
  assert.equal(result.checks.sessions.connected, 1);
});

test("integration probe fails when mock modes are active", async () => {
  const service = new IntegrationValidationService(
    { ping: async () => undefined },
    createStorage() as never,
    { listByTenant: async () => [connectedSession] } as never,
    { listActive: async () => [{ id: "worker-1", shardId: 0, shardCount: 1, status: "ACTIVE", leaseExpiresAt: new Date(Date.now() + 60000) }] } as never,
    { whatsappGateway: "MOCK", objectStorage: "MOCK" },
  );

  const result = await service.run({
    tenantId: "tenant-1",
    requireConnectedSession: false,
    performStorageRoundTrip: true,
  });

  assert.equal(result.decision, "FAIL");
  assert.equal(result.realModes, false);
});
