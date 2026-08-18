import assert from "node:assert/strict";
import test from "node:test";
import { proto, type WAMessage, type WASocket } from "@whiskeysockets/baileys";
import { InboundMessageService } from "../../src/application/services/inbound-message.service.js";

test("@lid se resuelve al celular boliviano antes de ejecutar la API", async () => {
  let cb: ((event: { type: string; messages: WAMessage[] }) => Promise<void>) | undefined;
  let vars: Record<string, string> | undefined;
  const socket = {
    ev: { on: (_n: string, h: typeof cb) => { cb = h; } },
    readMessages: async () => undefined,
    sendPresenceUpdate: async () => undefined,
    sendMessage: async (jid: string, content: { text: string }, options: { messageId: string }) => ({
      key: { id: options.messageId, remoteJid: jid, fromMe: true },
      message: proto.Message.create({ conversation: content.text }),
    }),
    signalRepository: { lidMapping: {
      getPNForLID: async (lid: string) => {
        assert.equal(lid, "248790443401357@lid");
        return "59172620787@s.whatsapp.net";
      },
    } },
  } as unknown as WASocket;
  const flow = {
    id: "flow", tenantId: "tenant-1", name: "Recinto", version: 1, isActive: true,
    definition: { version: 2 as const, trigger: { type: "CONTAINS" as const, value: "recinto" }, steps: [
      { id: "api", type: "API_REQUEST" as const, connectorId: "c1", statusVariable: "estado",
        mappings: [{ sourcePath: "dato[0].recinto", targetVariable: "recinto" }],
        successText: "{{recinto}}", notFoundText: "No", errorText: "Error" },
      { id: "fin", type: "END" as const },
    ] }, sessionIds: ["session-1"], createdAt: new Date(),
  };
  const service = new InboundMessageService(
    { recordInbound: async ({ remoteJid }: { remoteJid: string }) => ({ id: "conv", tenantId: "tenant-1", sessionId: "session-1", remoteJid, status: "OPEN", unreadCount: 1, tags: [], isBotActive: true, sessionBotActive: true }), clearFlowState: async () => undefined, saveFlowState: async () => undefined } as never,
    { findById: async () => ({ id: "session-1", tenantId: "tenant-1", ownerUserId: "u1", name: "Principal", status: "CONNECTED", isBotActive: true, shardKey: 1 }) } as never,
    { findActiveForSession: async () => flow, findByIdForSession: async () => flow } as never,
    { reserveInboundEvent: async () => true, releaseInboundEvent: async () => undefined, setInboundResponse: async () => undefined, save: async () => undefined } as never,
    "Default", { delay: async () => undefined, nextDelayMs: () => 0, createMessageId: () => "OUT-1" },
    { executeForFlow: async (input) => { vars = { ...input.variables }; return { outcome: "SUCCESS" as const, variables: { [input.statusVariable]: "SUCCESS", recinto: "Colegio" } }; } },
  );
  service.register(socket, "session-1");
  assert.ok(cb);
  await cb({ type: "notify", messages: [{ key: { id: "IN-1", remoteJid: "248790443401357@lid", fromMe: false }, message: proto.Message.create({ conversation: "recinto" }), messageTimestamp: 1721819200 }] });
  assert.equal(vars?.telefono, "59172620787");
  assert.equal(vars?.celular, "72620787");
  assert.equal(vars?.telefono_e164, "+59172620787");
});
