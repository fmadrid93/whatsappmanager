import assert from "node:assert/strict";
import test from "node:test";
import { PrismaConversationRepository } from "../../src/infrastructure/repositories/prisma-conversation.repository.js";

test("mensaje directo crea/reabre conversación humana y encola outbox", async () => {
  let conversationData: any;
  let outboxData: any;

  const tx = {
    conversation: {
      upsert: async (input: any) => {
        conversationData = input;
        return { id: "conv-1" };
      },
    },
    conversationOutbox: {
      create: async (input: any) => {
        outboxData = input;
        return { id: "outbox-1" };
      },
    },
  };

  const prisma = {
    whatsAppSession: {
      findFirst: async () => ({
        id: "session-1",
        status: "CONNECTED",
        phoneE164: "+59163538265",
      }),
    },
    $transaction: async (callback: any) => callback(tx),
  };

  const repository = new PrismaConversationRepository(prisma as never);
  const result = await repository.enqueueDirectText({
    tenantId: "tenant-1",
    sessionId: "session-1",
    actorUserId: "user-1",
    phoneE164: "+59172620787",
    displayName: "Fabricio",
    text: "Hola desde la plataforma",
  });

  assert.deepEqual(result, { conversationId: "conv-1", outboxId: "outbox-1" });
  assert.equal(conversationData.where.sessionId_remoteJid.remoteJid, "59172620787@s.whatsapp.net");
  assert.equal(conversationData.create.isBotActive, false);
  assert.equal(conversationData.create.assignedAgentId, "user-1");
  assert.equal(outboxData.data.remoteJid, "59172620787@s.whatsapp.net");
});

test("mensaje directo rechaza sesión en cuarentena", async () => {
  const prisma = {
    whatsAppSession: {
      findFirst: async () => ({
        id: "session-1",
        status: "QUARANTINED",
        phoneE164: "+59163538265",
      }),
    },
  };

  const repository = new PrismaConversationRepository(prisma as never);

  await assert.rejects(
    repository.enqueueDirectText({
      tenantId: "tenant-1",
      sessionId: "session-1",
      actorUserId: "user-1",
      phoneE164: "+59172620787",
      text: "Hola",
    }),
    /cuarentena/,
  );
});

test("mensaje directo rechaza autoenvío al número de la sesión", async () => {
  const prisma = {
    whatsAppSession: {
      findFirst: async () => ({
        id: "session-1",
        status: "CONNECTED",
        phoneE164: "+59163538265",
      }),
    },
  };

  const repository = new PrismaConversationRepository(prisma as never);

  await assert.rejects(
    repository.enqueueDirectText({
      tenantId: "tenant-1",
      sessionId: "session-1",
      actorUserId: "user-1",
      phoneE164: "+59163538265",
      text: "Hola",
    }),
    /mismo número/,
  );
});
