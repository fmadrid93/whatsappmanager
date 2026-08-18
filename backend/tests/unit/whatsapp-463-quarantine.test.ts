import assert from "node:assert/strict";
import test from "node:test";
import type { WASocket } from "@whiskeysockets/baileys";
import { BaileysMessagePersistenceHandler } from "../../src/infrastructure/whatsapp/baileys-message-persistence.handler.js";

test("ACK 463 pone en cuarentena solo la sesión automatizada", async () => {
  const handlers = new Map<string, (...args: any[]) => Promise<void>>();
  const socket = {
    ev: {
      on: (event: string, handler: (...args: any[]) => Promise<void>) => {
        handlers.set(event, handler);
      },
    },
  } as unknown as WASocket;

  const quarantines: Array<{ sessionId: string; reason: string; code?: number }> = [];

  const handler = new BaileysMessagePersistenceHandler(
    {
      quarantine: async (sessionId: string, reason: string, code?: number) => {
        quarantines.push({ sessionId, reason, code });
      },
    } as never,
    {
      updateStatus: async () => undefined,
      saveReceipt: async () => undefined,
      save: async () => undefined,
    } as never,
    {
      reconcileByMessageId: async () => undefined,
    } as never,
  );

  handler.register(socket, "session-1");

  const onUpdate = handlers.get("messages.update");
  assert.ok(onUpdate);

  await onUpdate([{
    key: {
      id: "MSG-1",
      remoteJid: "248790443401357@lid",
      fromMe: true,
    },
    update: {
      status: 0,
      messageStubParameters: ["463", "Your account has been restricted"],
    },
  }]);

  assert.equal(quarantines.length, 1);
  assert.equal(quarantines[0]?.sessionId, "session-1");
  assert.equal(quarantines[0]?.code, 463);
  assert.match(quarantines[0]?.reason ?? "", /WHATSAPP_463_AUTOMATION_RESTRICTED/);
  assert.match(quarantines[0]?.reason ?? "", /Your account has been restricted/);
});

test("un FAILED sin 463 no pone la sesión en cuarentena", async () => {
  const handlers = new Map<string, (...args: any[]) => Promise<void>>();
  const socket = {
    ev: {
      on: (event: string, handler: (...args: any[]) => Promise<void>) => {
        handlers.set(event, handler);
      },
    },
  } as unknown as WASocket;

  let quarantined = false;
  const handler = new BaileysMessagePersistenceHandler(
    {
      quarantine: async () => {
        quarantined = true;
      },
    } as never,
    {
      updateStatus: async () => undefined,
      saveReceipt: async () => undefined,
      save: async () => undefined,
    } as never,
    {
      reconcileByMessageId: async () => undefined,
    } as never,
  );

  handler.register(socket, "session-1");
  const onUpdate = handlers.get("messages.update");
  assert.ok(onUpdate);

  await onUpdate([{
    key: { id: "MSG-2", remoteJid: "59170000000@s.whatsapp.net", fromMe: true },
    update: { status: 0, messageStubParameters: ["999", "otro error"] },
  }]);

  assert.equal(quarantined, false);
});
