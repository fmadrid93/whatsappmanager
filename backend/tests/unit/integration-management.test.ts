import test from "node:test";
import assert from "node:assert/strict";
import { IntegrationManagementService, supportedWebhookEvents } from "../../src/application/services/integration-management.service.js";

test("crea una API key que solo se devuelve completa una vez", async () => {
  let storedHash = "";
  const repository = {
    createApiKey: async (input: any) => {
      storedHash = input.keyHash;
      return { ...input, id: "key-1", status: "ACTIVE", createdAt: new Date() };
    },
  } as any;
  const cryptoBox = { encrypt: (value: Buffer) => value, decrypt: (value: Buffer) => value } as any;
  const service = new IntegrationManagementService(repository, cryptoBox);
  const result = await service.createApiKey({
    tenantId: "tenant-1",
    createdByUserId: "user-1",
    name: "ERP",
    permissions: ["CAMPAIGN_CREATE"],
  });
  assert.match(result.secret, /^wsk_live_/);
  assert.equal(storedHash.length, 64);
  assert.notEqual(storedHash, result.secret);
});

test("los eventos críticos de campañas y failover están disponibles para webhooks", () => {
  assert.ok(supportedWebhookEvents.includes("MESSAGE_SENT"));
  assert.ok(supportedWebhookEvents.includes("SESSION_QUARANTINED"));
  assert.ok(supportedWebhookEvents.includes("AUTOMATIC_FAILOVER_EXECUTED"));
});
