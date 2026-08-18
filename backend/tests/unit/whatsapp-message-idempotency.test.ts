import assert from "node:assert/strict";
import test from "node:test";
import { PrismaWhatsAppMessageRepository } from "../../src/infrastructure/repositories/prisma-whatsapp-message.repository.js";

test("P2002 concurrente termina en update idempotente", async () => {
  let updates = 0;
  const prisma = { whatsAppMessage: {
    upsert: async () => { throw { code: "P2002" }; },
    update: async () => { updates += 1; return {}; },
  } };
  const repo = new PrismaWhatsAppMessageRepository(prisma as never);
  await repo.save({
    tenantId: "tenant-1", sessionId: "session-1", whatsappMessageId: "MSG-1",
    remoteJid: "59172620787@s.whatsapp.net", direction: "INBOUND", messageType: "conversation",
    status: "RECEIVED", fromMe: false, payload: Buffer.from("x"), messageTimestamp: new Date(),
  });
  assert.equal(updates, 1);
});
