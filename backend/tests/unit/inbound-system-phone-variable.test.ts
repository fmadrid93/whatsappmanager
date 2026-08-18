import assert from "node:assert/strict";
import test from "node:test";
import { proto, type WAMessage, type WASocket } from "@whiskeysockets/baileys";
import { InboundMessageService } from "../../src/application/services/inbound-message.service.js";

function inbound(id: string, text: string): WAMessage {
  return {
    key: { id, remoteJid: "59172620787@s.whatsapp.net", fromMe: false },
    message: proto.Message.create({ conversation: text }),
    messageTimestamp: 1_721_819_200,
  };
}

test("el flujo API recibe automaticamente el celular real del remitente", async () => {
  let callback: ((event: { type: string; messages: WAMessage[] }) => Promise<void>) | undefined;
  let capturedVariables: Record<string, string> | undefined;
  const sentTexts: string[] = [];

  const flow = {
    id: "flow-recinto",
    tenantId: "tenant-1",
    name: "Consulta recinto",
    version: 1,
    isActive: true,
    definition: {
      version: 2 as const,
      trigger: { type: "CONTAINS" as const, value: "recinto" },
      steps: [
        {
          id: "lookup",
          type: "API_REQUEST" as const,
          connectorId: "connector-1",
          statusVariable: "consulta_recinto_estado",
          mappings: [{ sourcePath: "dato[0].recinto", targetVariable: "recinto" }],
          successText: "Recinto {{recinto}} para {{telefono}}",
          notFoundText: "No encontrado",
          errorText: "Error",
        },
        { id: "fin", type: "END" as const, text: "Fin" },
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
      recordInbound: async ({ remoteJid }: { remoteJid: string }) => ({
        id: "conversation-1",
        tenantId: "tenant-1",
        sessionId: "session-1",
        remoteJid,
        phoneE164: "+59172620787",
        displayName: "Cliente",
        status: "OPEN",
        unreadCount: 1,
        tags: [],
        isBotActive: true,
        sessionBotActive: true,
      }),
      clearFlowState: async () => undefined,
      saveFlowState: async () => undefined,
    } as never,
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
    } as never,
    "Respuesta por defecto",
    { delay: async () => undefined, nextDelayMs: () => 0, createMessageId: () => crypto.randomUUID() },
    {
      executeForFlow: async (input) => {
        capturedVariables = { ...input.variables };
        return {
          outcome: "SUCCESS" as const,
          variables: {
            [input.statusVariable]: "SUCCESS",
            recinto: "U.E. Central",
          },
        };
      },
    },
  );

  service.register(socket, "session-1");
  assert.ok(callback);
  await callback({ type: "notify", messages: [inbound("IN-1", "cual es mi recinto")] });

  assert.equal(capturedVariables?.telefono, "59172620787");
  assert.equal(capturedVariables?.celular, "72620787");
  assert.equal(capturedVariables?.celular_internacional, "59172620787");
  assert.equal(capturedVariables?.telefono_e164, "+59172620787");
  assert.deepEqual(sentTexts, ["Recinto U.E. Central para 59172620787", "Fin"]);
});
