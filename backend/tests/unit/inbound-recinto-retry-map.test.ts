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

test("consultar nuevamente no entra en bucle y la respuesta incluye Google Maps", async () => {
  let callback: ((event: { type: string; messages: WAMessage[] }) => Promise<void>) | undefined;
  const sentTexts: string[] = [];
  let apiCalls = 0;

  const state: {
    flowId?: string;
    flowNodeId?: string;
    flowAwaitingVariable?: string;
    flowVariables?: Record<string, string>;
  } = {};

  const flow = {
    id: "flow-recinto",
    tenantId: "tenant-1",
    name: "Consulta de recinto por celular",
    version: 1,
    isActive: true,
    definition: {
      version: 2 as const,
      trigger: { type: "CONTAINS" as const, value: "recinto" },
      steps: [
        {
          id: "api",
          type: "API_REQUEST" as const,
          connectorId: "connector-recinto",
          statusVariable: "consulta_recinto_estado",
          mappings: [
            { sourcePath: "dato[0].recinto", targetVariable: "recinto" },
            { sourcePath: "dato[0].latitud", targetVariable: "latitud" },
            { sourcePath: "dato[0].longitud", targetVariable: "longitud" },
          ],
          // Simula un flujo viejo: todavía NO contiene {{mapa_url}}.
          successText: "🏫 Recinto: {{recinto}}\n📍 Ubicación: {{latitud}}, {{longitud}}",
          notFoundText: "No encontrado",
          errorText: "Error",
        },
        {
          id: "retry",
          type: "MENU" as const,
          text: "1. Consultar nuevamente\n2. Finalizar",
          variable: "accion_recinto",
          invalidText: "Opción inválida.",
          options: [
            { value: "1", label: "Consultar nuevamente", nextStepId: "api" },
            { value: "2", label: "Finalizar", nextStepId: "end" },
          ],
        },
        { id: "end", type: "END" as const, text: "Gracias." },
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
        status: "OPEN",
        unreadCount: 1,
        tags: [],
        isBotActive: true,
        sessionBotActive: true,
        ...state,
      }),
      saveFlowState: async (_id: string, input: {
        flowId: string;
        nodeIndex: number;
        awaitingVariable?: string;
        variables: Record<string, string>;
      }) => {
        state.flowId = input.flowId;
        state.flowNodeId = String(input.nodeIndex);
        state.flowAwaitingVariable = input.awaitingVariable;
        state.flowVariables = { ...input.variables };
      },
      clearFlowState: async () => {
        delete state.flowId;
        delete state.flowNodeId;
        delete state.flowAwaitingVariable;
        delete state.flowVariables;
      },
    } as never,
    {
      findById: async () => ({
        id: "session-1",
        tenantId: "tenant-1",
        ownerUserId: "user-1",
        name: "flavia bot",
        status: "CONNECTED",
        isBotActive: true,
        shardKey: 1,
      }),
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
    "Default",
    {
      delay: async () => undefined,
      nextDelayMs: () => 0,
      createMessageId: () => `OUT-${sentTexts.length + 1}`,
    },
    {
      executeForFlow: async (input) => {
        apiCalls += 1;
        return {
          outcome: "SUCCESS" as const,
          variables: {
            ...input.variables,
            [input.statusVariable]: "SUCCESS",
            recinto: "Colegio Nacional Blas Garay",
            latitud: "-25.531",
            longitud: "-56.267",
          },
        };
      },
    },
  );

  service.register(socket, "session-1");
  assert.ok(callback);

  // Primera consulta.
  await callback({ type: "notify", messages: [inbound("IN-1", "recinto")] });

  assert.equal(apiCalls, 1);
  assert.ok(sentTexts[0]?.includes("Colegio Nacional Blas Garay"));
  assert.ok(sentTexts[0]?.includes("https://www.google.com/maps?q=-25.531,-56.267"));
  assert.equal(sentTexts[1], "1. Consultar nuevamente\n2. Finalizar");

  // El usuario elige consultar nuevamente.
  await callback({ type: "notify", messages: [inbound("IN-2", "1")] });

  // Debe llamar a la API UNA sola vez más, volver al menú y esperar.
  // Antes del fix, accion_recinto seguía valiendo "1" y se repetía dentro del mismo inbound.
  assert.equal(apiCalls, 2);
  assert.ok(sentTexts[2]?.includes("https://www.google.com/maps?q=-25.531,-56.267"));
  assert.equal(sentTexts[3], "1. Consultar nuevamente\n2. Finalizar");
  assert.equal(state.flowAwaitingVariable, "accion_recinto");
  assert.equal(state.flowVariables?.accion_recinto, undefined);
});
