import assert from "node:assert/strict";
import test from "node:test";
import { proto, type WAMessage, type WASocket } from "@whiskeysockets/baileys";
import { InboundMessageService } from "../../src/application/services/inbound-message.service.js";

test("recinto usa el PN para la API pero responde al LID original", async () => {
  let callback: ((event: { type: string; messages: WAMessage[] }) => Promise<void>) | undefined;
  const sentTexts: string[] = [];
  const sentJids: string[] = [];
  let executedConnector = false;

  const socket = {
    ev: { on: (_name: string, handler: typeof callback) => { callback = handler; } },
    readMessages: async () => undefined,
    sendPresenceUpdate: async () => undefined,
    sendMessage: async (jid: string, content: { text: string }, options: { messageId: string }) => {
      sentJids.push(jid);
      sentTexts.push(content.text);
      return {
        key: { id: options.messageId, remoteJid: jid, fromMe: true },
        message: proto.Message.create({ conversation: content.text }),
      };
    },
    signalRepository: {
      lidMapping: {
        getPNForLID: async () => "59172620787@s.whatsapp.net",
      },
    },
  } as unknown as WASocket;

  const defaultFlow = {
    id: "flow-default",
    tenantId: "tenant-1",
    name: "Atencion comercial",
    version: 1,
    isActive: true,
    definition: {
      version: 2 as const,
      trigger: { type: "ANY" as const },
      steps: [{
        id: "menu",
        type: "MENU" as const,
        text: "Que opcion eliges?",
        variable: "opcion",
        options: [{ value: "1", label: "Ventas", nextStepId: "fin-default" }],
      }, { id: "fin-default", type: "END" as const }],
    },
    sessionIds: ["session-1"],
    createdAt: new Date(),
  };

  const recintoFlow = {
    id: "flow-recinto",
    tenantId: "tenant-1",
    name: "Recinto por celular",
    version: 1,
    isActive: true,
    definition: {
      version: 2 as const,
      trigger: { type: "CONTAINS" as const, value: "recinto" },
      steps: [{
        id: "api",
        type: "API_REQUEST" as const,
        connectorId: "connector-recinto",
        statusVariable: "consulta_recinto_estado",
        mappings: [{ sourcePath: "dato[0].recinto", targetVariable: "recinto" }],
        successText: "Tu recinto es {{recinto}}",
        notFoundText: "No encontramos recinto.",
        errorText: "Error consultando recinto.",
      }, { id: "fin-recinto", type: "END" as const }],
    },
    sessionIds: ["session-1"],
    createdAt: new Date(),
  };

  const service = new InboundMessageService(
    {
      recordInbound: async ({ remoteJid }: { remoteJid: string }) => ({
        id: "conversation-1",
        tenantId: "tenant-1",
        sessionId: "session-1",
        remoteJid,
        phoneE164: undefined,
        status: "OPEN",
        unreadCount: 1,
        tags: [],
        isBotActive: true,
        sessionBotActive: true,
        flowId: defaultFlow.id,
        flowNodeId: "0",
        flowAwaitingVariable: "opcion",
        flowVariables: {},
      }),
      saveFlowState: async () => undefined,
      clearFlowState: async () => undefined,
    } as never,
    {
      findById: async () => ({
        id: "session-1",
        tenantId: "tenant-1",
        ownerUserId: "user-1",
        name: "Ventas BO",
        status: "CONNECTED",
        isBotActive: true,
        shardKey: 1,
      }),
    } as never,
    {
      findActiveForSession: async (_sessionId: string, text: string) =>
        text.toLowerCase().includes("recinto") ? recintoFlow : defaultFlow,
      findByIdForSession: async () => defaultFlow,
    } as never,
    {
      reserveInboundEvent: async () => true,
      releaseInboundEvent: async () => undefined,
      setInboundResponse: async () => undefined,
      save: async () => undefined,
    } as never,
    "Default",
    { delay: async () => undefined, nextDelayMs: () => 0, createMessageId: () => `OUT-${sentTexts.length + 1}` },
    {
      executeForFlow: async (input) => {
        executedConnector = true;
        assert.equal(input.variables.celular, "72620787");
        return {
          outcome: "SUCCESS" as const,
          variables: {
            ...input.variables,
            [input.statusVariable]: "SUCCESS",
            recinto: "Colegio Nacional Blas Garay",
          },
        };
      },
    },
  );

  service.register(socket, "session-1");
  assert.ok(callback);

  const message: WAMessage = {
    key: { id: "IN-RECINTO", remoteJid: "248790443401357@lid", fromMe: false },
    message: proto.Message.create({ conversation: "recinto" }),
    messageTimestamp: 1_721_819_200,
  };

  await callback({ type: "notify", messages: [message] });

  assert.equal(executedConnector, true);
  assert.ok(sentTexts.some((text) => text.includes("Colegio Nacional Blas Garay")));
  assert.ok(!sentTexts.some((text) => text.includes("Que opcion eliges")));
  assert.ok(sentJids.every((jid) => jid === "248790443401357@lid"));
});
