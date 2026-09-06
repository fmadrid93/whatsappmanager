import assert from "node:assert/strict";
import test from "node:test";
import { proto, type WAMessage, type WASocket } from "@whiskeysockets/baileys";
import { InboundMessageService } from "../../src/application/services/inbound-message.service.js";
import type { Voto1x10DbRepository, Voto1x10PersonaMovilizadaRow } from "../../src/infrastructure/voto1x10/voto1x10-db.repository.js";

function inbound(id: string, text: string, senderPhone = "595982939821"): WAMessage {
  return {
    key: { id, remoteJid: `${senderPhone}@s.whatsapp.net`, fromMe: false },
    message: proto.Message.create({ conversation: text }),
    messageTimestamp: 1_721_819_200,
  };
}

test("respuesta directa de campaña (1 o 2) ejecuta de inmediato la opción del menú y actualiza la BD sin reenviar la pregunta", async () => {
  const sentTexts: string[] = [];
  let callback: ((event: { type: string; messages: WAMessage[] }) => Promise<void>) | undefined;
  const state: {
    flowId?: string;
    flowNodeId?: string;
    flowAwaitingVariable?: string;
    flowVariables?: Record<string, string>;
  } = {};

  const flow = {
    id: "flow-plra",
    tenantId: "tenant-1",
    name: "Encuesta de Confirmación PLRA",
    version: 1,
    isActive: true,
    definition: {
      version: 2 as const,
      trigger: { type: "ANY" as const },
      steps: [
        {
          id: "step-menu",
          type: "MENU" as const,
          text: "¡Hola {{nombre}}! 1. Sí, quiero apoyar\n2. No me interesa",
          variable: "respuesta_apoyo",
          options: [
            { value: "1", label: "1️⃣ Sí, quiero apoyar", nextStepId: "step-apoya" },
            { value: "2", label: "2️⃣ No me interesa", nextStepId: "step-no-apoya" },
          ],
        },
        { id: "step-apoya", type: "END" as const, text: "¡Excelente {{nombre}}! Muchas gracias por tu apoyo." },
        { id: "step-no-apoya", type: "END" as const, text: "Entendido {{nombre}}, disculpa la molestia." },
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

  let dbUpdatedWith: { celular: string; estadoApoyo: string; observacion: string } | null = null;

  const mockDbRepo: Voto1x10DbRepository = {
    buscarPorCelular: async (celular: string): Promise<Voto1x10PersonaMovilizadaRow | null> => {
      return {
        IdPersonaMovilizada: 11349,
        Nombres: "MARCIA CATALINA",
        Apellidos: "PEREIRA DE FRANCO",
        Celular: celular,
        EstadoApoyo: "PENDIENTE",
      };
    },
    actualizarCompromisoPorCelular: async (
      celular: string,
      estadoApoyo: string,
      observacion: string,
    ): Promise<Voto1x10PersonaMovilizadaRow | null> => {
      dbUpdatedWith = { celular, estadoApoyo, observacion };
      return {
        IdPersonaMovilizada: 11349,
        Nombres: "MARCIA CATALINA",
        Apellidos: "PEREIRA DE FRANCO",
        Celular: celular,
        EstadoApoyo: estadoApoyo,
      };
    },
  } as unknown as Voto1x10DbRepository;

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
    { delay: async () => undefined, nextDelayMs: () => 0, createMessageId: () => "OUT-1" },
    undefined,
    null,
    mockDbRepo,
  );

  service.register(socket, "session-1");
  assert.ok(callback);

  // El votante recibió una campaña previa y responde directamente con "1"
  await callback({ type: "notify", messages: [inbound("IN-1", "1", "595982939821")] });

  // 1. Debe haber enviado directamente la respuesta final personalizada con el nombre real de la BD
  assert.equal(sentTexts.length, 1);
  assert.equal(sentTexts[0], "¡Excelente MARCIA CATALINA! Muchas gracias por tu apoyo.");

  // 2. La base de datos debe haberse actualizado con APOYA
  assert.ok(dbUpdatedWith);
  assert.equal(dbUpdatedWith.estadoApoyo, "APOYA");
  assert.ok(dbUpdatedWith.observacion.includes("1"));

  // 3. El estado de la conversación debe haber quedado limpio (no bloqueado en el menú)
  assert.equal(state.flowId, undefined);
});
