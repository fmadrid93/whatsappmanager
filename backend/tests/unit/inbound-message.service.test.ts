import assert from "node:assert/strict";
import test from "node:test";
import { proto, type WAMessage, type WASocket } from "@whiskeysockets/baileys";
import { InboundMessageService } from "../../src/application/services/inbound-message.service.js";
import type { SaveWhatsAppMessageInput } from "../../src/application/ports/repositories/whatsapp-message.repository.js";

function message(remoteJid = "5491123456789@s.whatsapp.net"): WAMessage {
  return {
    key: { id: "INBOUND-1", remoteJid, fromMe: false },
    message: proto.Message.create({ conversation: "Hola" }),
    messageTimestamp: 1_721_819_200,
  };
}

function fixture(options: { reserved?: boolean; readFails?: boolean; botActive?: boolean } = {}) {
  const events: string[] = [];
  const saved: SaveWhatsAppMessageInput[] = [];
  let callback: ((event: { type: string; messages: WAMessage[] }) => Promise<void>) | undefined;
  let releases = 0;
  let responses = 0;

  const socket = {
    ev: { on: (_name: string, handler: typeof callback) => { callback = handler; } },
    readMessages: async () => { events.push("read"); if (options.readFails) throw new Error("read failed"); },
    sendPresenceUpdate: async (state: string, jid: string) => { events.push(`${state}:${jid}`); },
    sendMessage: async (jid: string, _content: unknown, sendOptions: { messageId: string }) => {
      events.push(`send:${jid}:${sendOptions.messageId}`);
      return { key: { id: sendOptions.messageId, remoteJid: jid, fromMe: true }, message: proto.Message.create({ conversation: "Respuesta" }) };
    },
  } as unknown as WASocket;

  const service = new InboundMessageService(
    {
      recordInbound: async ({ remoteJid }) => ({
        id: "conversation-1", tenantId: "tenant-1", sessionId: "session-1", remoteJid,
        isBotActive: options.botActive ?? true, sessionBotActive: true,
      }),
      listByTenant: async () => [],
      setHumanMode: async () => undefined,
      saveFlowState: async () => undefined,
      clearFlowState: async () => undefined,
    },
    {
      findById: async () => ({ id: "session-1", tenantId: "tenant-1", ownerUserId: "user-1", name: "Principal", status: "CONNECTED", isBotActive: true, shardKey: 1 }),
    } as never,
    {
      findActiveForSession: async () => ({
        id: "flow-1", tenantId: "tenant-1", name: "Flujo", version: 2, isActive: true,
        definition: { version: 2, trigger: { type: "ANY" }, steps: [{ id: "message", type: "MESSAGE", text: "Respuesta flujo" }, { id: "end", type: "END" }] },
        sessionIds: ["session-1"], createdAt: new Date(),
      }),
      findByIdForSession: async () => null,
    } as never,
    {
      reserveInboundEvent: async () => options.reserved ?? true,
      releaseInboundEvent: async () => { releases += 1; },
      setInboundResponse: async () => { responses += 1; },
      save: async (input: SaveWhatsAppMessageInput) => { saved.push(input); },
      getMessagePayload: async () => null,
      exists: async () => false,
      updateStatus: async () => undefined,
      saveReceipt: async () => undefined,
    },
    "Respuesta por defecto",
    {
      delay: async (ms) => { events.push(`delay:${ms}`); },
      nextDelayMs: () => 2500,
      createMessageId: () => "OUTBOUND-1",
    },
  );
  service.register(socket, "session-1");

  return {
    invoke: async (payload = message()) => {
      assert.ok(callback, "El listener messages.upsert no fue registrado");
      await callback({ type: "notify", messages: [payload] });
    },
    events,
    saved,
    get releases() { return releases; },
    get responses() { return responses; },
  };
}

test("preserva remoteJid y ejecuta read → composing → delay → send → paused", async () => {
  const f = fixture();
  const jid = "5491123456789@s.whatsapp.net";
  await f.invoke(message(jid));

  assert.deepEqual(f.events, [
    "read",
    `composing:${jid}`,
    "delay:2500",
    `send:${jid}:OUTBOUND-1`,
    `paused:${jid}`,
  ]);
  assert.equal(f.saved.length, 2);
  assert.equal(f.saved[0]?.remoteJid, jid);
  assert.equal(f.saved[1]?.remoteJid, jid);
  assert.equal(f.responses, 1);
});

test("un evento entrante ya reservado no vuelve a responder", async () => {
  const f = fixture({ reserved: false });
  await f.invoke();
  assert.deepEqual(f.events, []);
  assert.equal(f.saved.length, 0);
});

test("libera la reserva idempotente cuando falla el procesamiento", async () => {
  const f = fixture({ readFails: true });
  await f.invoke();
  assert.equal(f.releases, 1);
  assert.deepEqual(f.events, ["read"]);
});

test("persiste el entrante pero no responde cuando un agente pausó el bot", async () => {
  const f = fixture({ botActive: false });
  await f.invoke();
  assert.deepEqual(f.events, ["read"]);
  assert.equal(f.saved.length, 1);
  assert.equal(f.responses, 0);
});
