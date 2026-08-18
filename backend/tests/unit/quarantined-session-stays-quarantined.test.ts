import assert from "node:assert/strict";
import test from "node:test";
import {
  BaileysSessionGateway,
  shouldPreserveQuarantine,
} from "../../src/infrastructure/whatsapp/baileys-session-gateway.js";

test("un cierre intencional conserva QUARANTINED", () => {
  assert.equal(shouldPreserveQuarantine("QUARANTINED", true), true);
  assert.equal(shouldPreserveQuarantine("CONNECTED", true), false);
  assert.equal(shouldPreserveQuarantine("QUARANTINED", false), false);
});

test("start no resucita una sesión QUARANTINED", async () => {
  let released = 0;
  let statusUpdates = 0;

  const gateway = new BaileysSessionGateway(
    {
      findById: async () => ({
        id: "session-1",
        tenantId: "tenant-1",
        ownerUserId: "user-1",
        name: "flavia bot",
        status: "QUARANTINED",
        isBotActive: false,
        lastConnectionCode: 463,
        lastConnectionError: "WHATSAPP_463_AUTOMATION_RESTRICTED",
        shardKey: 1,
      }),
      releaseLease: async () => { released += 1; },
      updateStatus: async () => { statusUpdates += 1; },
    } as never,
    {} as never,
    {
      has: () => false,
    } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    "worker-1",
  );

  await gateway.start("session-1");

  assert.equal(released, 1);
  assert.equal(statusUpdates, 0);
});
