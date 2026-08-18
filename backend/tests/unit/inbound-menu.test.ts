import assert from "node:assert/strict";
import test from "node:test";
import { proto, type WAMessage, type WASocket } from "@whiskeysockets/baileys";
import { InboundMessageService } from "../../src/application/services/inbound-message.service.js";

function inbound(id: string, text: string): WAMessage {
  return {
    key: { id, remoteJid: "59170000000@s.whatsapp.net", fromMe: false },
    message: proto.Message.create({ conversation: text }),
    messageTimestamp: 1_721_819_200,
  };
}

test("un menú multinivel espera la selección y salta al bloque configurado", async () => {
  const sentTexts: string[] = [];
  let callback: ((event: { type: string; messages: WAMessage[] }) => Promise<void>) | undefined;
  const state: {
    flowId?: string;
    flowNodeId?: string;
    flowAwaitingVariable?: string;
    flowVariables?: Record<string, string>;
  } = {};

  const flow = {
    id: "flow-menu",
    tenantId: "tenant-1",
    name: "Menú",
    version: 1,
    isActive: true,
    definition: {
      version: 2 as const,
      trigger: { type: "ANY" as const },
      steps: [
        {
          id: "main",
          type: "MENU" as const,
          text: "1. Ventas\n2. Soporte",
          variable: "opcion",
          options: [
            { value: "1", label: "Ventas", nextStepId: "sales" },
            { value: "2", label: "Soporte", nextStepId: "support" },
          ],
        },
        { id: "sales", type: "END" as const, text: "Ruta ventas" },
        { id: "support", type: "END" as const, text: "Ruta soporte" },
      ],
    },
    sessionIds: ["session-1"],
    createdAt: new Date(),
  };

  const socket = {
    ev: { on: (_name: string, handler: typeof callback) => { callback = handler; } },
    readMessages: async () => undefined,
    sendPresenceUpdate: async () => undefined,
    sendMessage: async (jid: string, content: { text: string }, options: { messageId: string }) => {
      sentTexts.push(content.text);
      return {
        key: { id: options.messageId, remoteJid: jid, fromMe: true },
        message: proto.Message.create({ conversation: content.text }),
      };
    },
  } as unknown as WASocket;

  const service = new InboundMessageService(
    {
      recordInbound: async ({ remoteJid }) => ({
        id: "conversation-1",
        tenantId: "tenant-1",
        sessionId: "session-1",
        remoteJid,
        isBotActive: true,
        sessionBotActive: true,
        ...state,
      }),
      listByTenant: async () => [],
      setHumanMode: async () => undefined,
      saveFlowState: async (_id, input) => {
        state.flowId = input.flowId;
        state.flowNodeId = String(input.nodeIndex);
        state.flowAwaitingVariable = input.awaitingVariable;
        state.flowVariables = input.variables;
      },
      clearFlowState: async () => {
        delete state.flowId;
        delete state.flowNodeId;
        delete state.flowAwaitingVariable;
        delete state.flowVariables;
      },
    },
    {
      findById: async () => ({ id: "session-1", tenantId: "tenant-1", ownerUserId: "user-1", name: "Principal", status: "CONNECTED", isBotActive: true, shardKey: 1 }),
    } as never,
    {
      findActiveForSession: async () => flow,
      findByIdForSession: async () => flow,
    } as never,
    {
      reserveInboundEvent: async () => true,
      releaseInboundEvent: async () => undefined,
      setInboundResponse: async () => undefined,
      save: async () => undefined,
      getMessagePayload: async () => null,
      exists: async () => false,
      updateStatus: async () => undefined,
      saveReceipt: async () => undefined,
    },
    "Respuesta por defecto",
    { delay: async () => undefined, nextDelayMs: () => 0, createMessageId: () => crypto.randomUUID() },
  );

  service.register(socket, "session-1");
  assert.ok(callback);
  await callback({ type: "notify", messages: [inbound("IN-1", "hola")] });
  await callback({ type: "notify", messages: [inbound("IN-2", "2")] });

  assert.deepEqual(sentTexts, ["1. Ventas\n2. Soporte", "Ruta soporte"]);
  assert.equal(state.flowId, undefined);
});
