import crypto from "node:crypto";
import { getContentType, proto, type WAMessage, type WASocket } from "@whiskeysockets/baileys";
import type { IConversationRepository, ConversationRecord } from "../ports/repositories/conversation.repository.js";
import type { ISessionRepository } from "../ports/repositories/session.repository.js";
import type { BotFlowRecord, BotFlowStep, IBotFlowRepository } from "../ports/repositories/bot-flow.repository.js";
import type { IExternalConnectorExecutor } from "../ports/integrations/external-connector.executor.js";
import type { IWhatsAppMessageRepository } from "../ports/repositories/whatsapp-message.repository.js";
import type { Voto1x10Client } from "../../infrastructure/voto1x10/voto1x10-client.js";
import { randomBetween, sleep } from "../../shared/utils/delay.js";
import { logger } from "../../shared/logger/logger.js";

function messageDate(message: WAMessage): Date {
  const value = message.messageTimestamp;
  if (typeof value === "number") return new Date(value * 1000);
  if (typeof value === "bigint") return new Date(Number(value) * 1000);
  if (value && typeof value === "object" && "toNumber" in value) return new Date((value as { toNumber: () => number }).toNumber() * 1000);
  return new Date();
}

function inboundText(message: WAMessage): string {
  const content = message.message;
  if (!content) return "";
  return (
    content.conversation
    ?? content.extendedTextMessage?.text
    ?? content.imageMessage?.caption
    ?? content.videoMessage?.caption
    ?? content.buttonsResponseMessage?.selectedDisplayText
    ?? content.buttonsResponseMessage?.selectedButtonId
    ?? content.listResponseMessage?.title
    ?? content.listResponseMessage?.singleSelectReply?.selectedRowId
    ?? content.templateButtonReplyMessage?.selectedDisplayText
    ?? content.templateButtonReplyMessage?.selectedId
    ?? ""
  ).trim();
}

function interpolate(text: string, variables: Record<string, string>): string {
  return text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => variables[key] ?? "");
}

/**
 * WhatsApp no permite mandar botones nativos de forma confiable con Baileys
 * (WhatsApp los bloquea/descarta seguido cuando vienen de un cliente no
 * oficial). En vez de eso, el paso MENU se vuelve más tolerante a cómo la
 * gente realmente escribe: sin tildes, con mayúsculas de más, con texto
 * alrededor del número, o con sinónimos comunes de sí/no.
 */
function normalizeForMatch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // saca tildes (marcas diacriticas combinantes)
    .toLocaleLowerCase()
    .replace(/[¡!¿?.,;:()"'“”]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const YES_SYNONYMS = new Set(["si", "s", "sip", "siii", "yes", "ok", "dale", "afirmativo", "correcto", "ya vote"]);
const NO_SYNONYMS = new Set(["no", "n", "nop", "negativo", "todavia no", "aun no"]);

function optionLooksLike(normalizedValue: string, normalizedLabel: string, synonyms: Set<string>): boolean {
  return synonyms.has(normalizedValue) || synonyms.has(normalizedLabel);
}

function matchesMenuOption(rawInput: string, option: { value: string; label: string }): boolean {
  const input = normalizeForMatch(rawInput);
  const value = normalizeForMatch(option.value);
  const label = normalizeForMatch(option.label);

  if (input === value || input === label) return true;

  // Valor numérico ("1", "2"): aceptar el número aunque venga acompañado de
  // texto ("el 1 porfa", "opcion 1 porfavor").
  if (/^\d+$/.test(value)) {
    const match = input.match(/\d+/);
    if (match && match[0] === value) return true;
  }

  // Sinónimos de sí/no, solo si esta opción puntual ya es semánticamente
  // sí/no (para no "adivinar" en menús de opciones múltiples que no lo son).
  if (optionLooksLike(value, label, YES_SYNONYMS) && YES_SYNONYMS.has(input)) return true;
  if (optionLooksLike(value, label, NO_SYNONYMS) && NO_SYNONYMS.has(input)) return true;

  return false;
}

function conditionPasses(step: Extract<BotFlowStep, { type: "CONDITION" }>, variables: Record<string, string>): boolean {
  const actual = variables[step.variable]?.trim() || "";
  if (step.operator === "EXISTS") return actual.length > 0;
  const expected = step.value?.trim() || "";
  if (step.operator === "EQUALS") return actual.toLocaleLowerCase() === expected.toLocaleLowerCase();
  return actual.toLocaleLowerCase().includes(expected.toLocaleLowerCase());
}


function normalizedCoordinate(value: string | undefined): string {
  const normalized = String(value ?? "").trim().replace(",", ".");
  return /^-?\d{1,3}(?:\.\d+)?$/.test(normalized) ? normalized : "";
}

function googleMapsUrlFromVariables(variables: Record<string, string>): string {
  const latitude = normalizedCoordinate(variables.latitud);
  const longitude = normalizedCoordinate(variables.longitud);
  if (!latitude || !longitude) return "";
  return `https://www.google.com/maps?q=${latitude},${longitude}`;
}


function phoneDigitsFromValue(value: unknown): string {
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (text.includes("@") && !text.endsWith("@s.whatsapp.net")) return "";
  const user = text.split("@")[0]?.split(":")[0] ?? "";
  return user.replace(/\D/g, "");
}

type ExtendedMessageKey = WAMessage["key"] & {
  remoteJidAlt?: string | null;
  participantAlt?: string | null;
  senderPn?: string | null;
  participantPn?: string | null;
};

type SocketWithLidMapping = WASocket & {
  signalRepository?: {
    lidMapping?: {
      getPNForLID?: (lid: string) => Promise<string | undefined | null>;
    };
  };
};

interface SenderAddress {
  phoneDigits: string;
  replyJid: string;
}


async function resolveSenderAddress(
  socket: WASocket,
  message: WAMessage,
  conversation: ConversationRecord,
): Promise<SenderAddress> {
  const key = message.key as ExtendedMessageKey;
  const originalJid = key.remoteJid || conversation.remoteJid;
  const directCandidates = [
    key.remoteJidAlt,
    key.participantAlt,
    key.senderPn,
    key.participantPn,
    key.participant,
    conversation.phoneE164,
    key.remoteJid,
  ];

  for (const candidate of directCandidates) {
    const digits = phoneDigitsFromValue(candidate);
    if (digits) {
      return {
        phoneDigits: digits,
        // Para responder conservamos el JID que WhatsApp entrego en el mensaje.
        // El PN se usa solo como dato de negocio/API, no para reconstruir el destino.
        replyJid: originalJid,
      };
    }
  }

  const lid = originalJid.endsWith("@lid") ? originalJid : undefined;
  if (lid) {
    try {
      const mapping = (socket as SocketWithLidMapping).signalRepository?.lidMapping;
      const pn = mapping?.getPNForLID ? await mapping.getPNForLID(lid) : undefined;
      const digits = phoneDigitsFromValue(pn);
      if (digits) {
        return { phoneDigits: digits, replyJid: originalJid };
      }
    } catch (error) {
      logger.warn({ error, remoteJid: lid }, "No se pudo resolver LID a numero telefonico.");
    }
  }

  return { phoneDigits: "", replyJid: originalJid };
}

class AutomationSessionBlockedError extends Error {
  constructor(public readonly sessionId: string, public readonly status: string) {
    super(`La automatización de la sesión ${sessionId} está bloqueada (${status}).`);
    this.name = "AutomationSessionBlockedError";
  }
}

function sessionBlocksAutomation(session: { status: string; isBotActive: boolean } | null): boolean {
  return !session || session.status === "QUARANTINED" || !session.isBotActive;
}

export interface InboundMessageTiming {
  delay?: (milliseconds: number) => Promise<void>;
  nextDelayMs?: () => number;
  createMessageId?: () => string;
}

export class InboundMessageService {
  private readonly wait: (milliseconds: number) => Promise<void>;
  private readonly nextDelayMs: () => number;
  private readonly createMessageId: () => string;

  constructor(
    private readonly conversations: IConversationRepository,
    private readonly sessions: ISessionRepository,
    private readonly flows: IBotFlowRepository,
    private readonly messages: IWhatsAppMessageRepository,
    private readonly defaultReply: string,
    timing: InboundMessageTiming = {},
    private readonly externalConnectors?: IExternalConnectorExecutor,
    private readonly voto1x10Client?: Voto1x10Client | null,
  ) {
    this.wait = timing.delay ?? sleep;
    this.nextDelayMs = timing.nextDelayMs ?? (() => randomBetween(2000, 4000));
    this.createMessageId = timing.createMessageId ?? (() => crypto.randomUUID().replaceAll("-", "").toUpperCase());
  }

  register(socket: WASocket, sessionId: string): void {
    socket.ev.on("messages.upsert", async ({ type, messages }: { type: string; messages: WAMessage[] }) => {
      if (type !== "notify") return;
      for (const message of messages) {
        try { await this.handle(socket, sessionId, message); }
        catch (error) { logger.error({ error, sessionId, messageId: message.key.id }, "Error procesando mensaje entrante."); }
      }
    });
  }

  private async sendText(
    socket: WASocket,
    conversation: ConversationRecord,
    remoteJid: string,
    text: string,
    inboundMessageId: string,
  ): Promise<void> {
    const finalText = text.trim();
    if (!finalText) return;

    const initialSession = await this.sessions.findById(conversation.sessionId);
    if (sessionBlocksAutomation(initialSession)) {
      throw new AutomationSessionBlockedError(conversation.sessionId, initialSession?.status ?? "NOT_FOUND");
    }

    await socket.sendPresenceUpdate("composing", remoteJid);
    let sent: Awaited<ReturnType<WASocket["sendMessage"]>>;
    try {
      await this.wait(this.nextDelayMs());

      // El ACK 463 llega de forma asíncrona. Revalidamos justo antes del siguiente envío
      // para que una cuarentena aplicada por messages.update corte el flujo actual.
      const currentSession = await this.sessions.findById(conversation.sessionId);
      if (sessionBlocksAutomation(currentSession)) {
        throw new AutomationSessionBlockedError(conversation.sessionId, currentSession?.status ?? "NOT_FOUND");
      }

      logger.debug({ conversationId: conversation.id, targetJid: remoteJid }, "Enviando respuesta del bot.");
      sent = await socket.sendMessage(remoteJid, { text: finalText }, { messageId: this.createMessageId() });
      logger.info(
        { conversationId: conversation.id, targetJid: remoteJid, whatsappMessageId: sent?.key.id },
        "Respuesta del bot aceptada por Baileys.",
      );
    } finally {
      try {
        await socket.sendPresenceUpdate("paused", remoteJid);
      } catch {
        // No ocultar el error real si el socket se cerro.
      }
    }
    if (sent?.key.id && sent.message) {
      await this.messages.save({
        tenantId: conversation.tenantId,
        sessionId: conversation.sessionId,
        conversationId: conversation.id,
        whatsappMessageId: sent.key.id,
        remoteJid,
        direction: "OUTBOUND",
        messageType: getContentType(sent.message) ?? "conversation",
        status: "SUBMITTED",
        fromMe: true,
        payload: Buffer.from(proto.Message.encode(sent.message).finish()),
        messageTimestamp: new Date(),
      });
      await this.messages.setInboundResponse(conversation.sessionId, inboundMessageId, sent.key.id);
    }
  }

  private async runFlow(
    socket: WASocket,
    conversation: ConversationRecord,
    remoteJid: string,
    inboundMessageId: string,
    text: string,
    inboundMessage: WAMessage,
  ): Promise<boolean> {
    let flow: BotFlowRecord | null = null;
    let index = Number.parseInt(conversation.flowNodeId || "0", 10);
    if (!Number.isFinite(index) || index < 0) index = 0;
    const variables = { ...(conversation.flowVariables || {}) };

    // Resuelve por separado el identificador de conversacion (@lid) y el PN real.
    // El JID original se conserva para enrutar la respuesta por WhatsApp.
    // El numero telefonico real se utiliza solamente para variables de negocio y APIs externas.
    const sender = await resolveSenderAddress(socket, inboundMessage, conversation);
    const phoneDigits = sender.phoneDigits;
    const replyJid = sender.replyJid || remoteJid;
    if (phoneDigits) {
      const boliviaLocalCell = phoneDigits.startsWith("591") && phoneDigits.length === 11
        ? phoneDigits.slice(3)
        : phoneDigits;
      variables.telefono = phoneDigits;
      variables.celular = boliviaLocalCell;
      variables.celular_internacional = phoneDigits;
      variables.telefono_e164 = `+${phoneDigits}`;

      if (this.voto1x10Client) {
        try {
          const syncResult = await this.voto1x10Client.procesarRespuestaBot(phoneDigits, text);
          if (syncResult) {
            if (syncResult.nombreVotante) {
              variables.nombre = syncResult.nombreVotante;
              variables.nombre_votante = syncResult.nombreVotante;
            }
            if (syncResult.estadoApoyoAsignado) {
              variables.estado_apoyo = syncResult.estadoApoyoAsignado;
            }
          }
        } catch (error) {
          logger.warn({ error, phoneDigits, text }, "No se pudo sincronizar respuesta de bot con 1x10 API.");
        }
      }
    }

    // EXACT y CONTAINS se comportan como comandos globales. Esto permite que "recinto"
    // interrumpa, por ejemplo, un menu anterior que estaba esperando la variable "opcion".
    const triggeredFlow = await this.flows.findActiveForSession(conversation.sessionId, text);
    const explicitTriggeredFlow = triggeredFlow && triggeredFlow.definition.trigger.type !== "ANY"
      ? triggeredFlow
      : null;

    if (explicitTriggeredFlow) {
      flow = explicitTriggeredFlow;
      index = 0;
      conversation.flowAwaitingVariable = undefined;
    } else {
      if (conversation.flowId) {
        flow = await this.flows.findByIdForSession(conversation.flowId, conversation.sessionId);
      }
      if (flow && conversation.flowAwaitingVariable) {
        variables[conversation.flowAwaitingVariable] = text;
        conversation.flowAwaitingVariable = undefined;
      }
      if (!flow) {
        flow = triggeredFlow;
        index = 0;
      }
    }
    if (!flow) return false;

    for (let guard = 0; guard < 50 && index < flow.definition.steps.length; guard += 1) {
      const step = flow.definition.steps[index];

      if (!step) {
        break;
      }

      if (step.type === "MESSAGE") {
        await this.sendText(socket, conversation, replyJid, interpolate(step.text, variables), inboundMessageId);
        index += 1;
        continue;
      }
      if (step.type === "QUESTION") {
        await this.sendText(socket, conversation, replyJid, interpolate(step.text, variables), inboundMessageId);
        await this.conversations.saveFlowState(conversation.id, {
          flowId: flow.id,
          nodeIndex: index + 1,
          awaitingVariable: step.variable,
          variables,
        });
        return true;
      }
      if (step.type === "MENU") {
        const selectedValue = variables[step.variable]?.trim();
        if (!selectedValue) {
          await this.sendText(socket, conversation, replyJid, interpolate(step.text, variables), inboundMessageId);
          await this.conversations.saveFlowState(conversation.id, {
            flowId: flow.id,
            nodeIndex: index,
            awaitingVariable: step.variable,
            variables,
          });
          return true;
        }

        const selectedOption = step.options.find((option) => matchesMenuOption(selectedValue, option));
        if (!selectedOption) {
          delete variables[step.variable];
          const retryText = step.invalidText?.trim()
            ? `${step.invalidText.trim()}

${step.text}`
            : `Opción inválida. Intenta nuevamente.

${step.text}`;
          await this.sendText(socket, conversation, replyJid, interpolate(retryText, variables), inboundMessageId);
          await this.conversations.saveFlowState(conversation.id, {
            flowId: flow.id,
            nodeIndex: index,
            awaitingVariable: step.variable,
            variables,
          });
          return true;
        }

        const targetIndex = flow.definition.steps.findIndex((candidate) => candidate.id === selectedOption.nextStepId);
        if (targetIndex < 0) {
          logger.error({ flowId: flow.id, stepId: step.id, nextStepId: selectedOption.nextStepId }, "Destino de menú inexistente.");
          await this.conversations.clearFlowState(conversation.id);
          return true;
        }

        // La respuesta de un menú es un evento consumible, no una variable permanente.
        // Esto es crítico cuando una opción vuelve a un paso anterior (por ejemplo:
        // "Consultar nuevamente" -> API -> mismo menú). Si conservamos el "1",
        // el menú lo vuelve a ejecutar sin esperar un nuevo mensaje y genera un bucle.
        delete variables[step.variable];

        index = targetIndex;
        continue;
      }
      if (step.type === "CONDITION") {
        const selected = conditionPasses(step, variables) ? step.ifTrueText : step.ifFalseText;
        if (selected) await this.sendText(socket, conversation, replyJid, interpolate(selected, variables), inboundMessageId);
        index += 1;
        continue;
      }
      if (step.type === "API_REQUEST") {
        const execution = this.externalConnectors
          ? await this.externalConnectors.executeForFlow({
              tenantId: conversation.tenantId,
              connectorId: step.connectorId,
              conversationId: conversation.id,
              variables,
              mappings: step.mappings,
              statusVariable: step.statusVariable,
            })
          : {
              outcome: "ERROR" as const,
              variables: { [step.statusVariable]: "ERROR" },
              errorMessage: "El ejecutor de conectores externos no está configurado.",
            };
        Object.assign(variables, execution.variables);

        const mapUrl = googleMapsUrlFromVariables(variables);
        if (mapUrl) {
          variables.mapa_url = mapUrl;
          variables.google_maps_url = mapUrl;
        }

        const selectedText = execution.outcome === "SUCCESS"
          ? step.successText
          : execution.outcome === "NOT_FOUND"
            ? step.notFoundText
            : step.errorText;
        if (selectedText) {
          let renderedText = interpolate(selectedText, variables);

          // Compatibilidad con flujos de recinto ya guardados antes del parche 22:
          // si la API devolvió coordenadas y el texto todavía no contiene el mapa,
          // agregamos un enlace clickeable automáticamente.
          if (
            execution.outcome === "SUCCESS"
            && mapUrl
            && !renderedText.includes(mapUrl)
            && !/https:\/\/(?:www\.)?google\.com\/maps/i.test(renderedText)
          ) {
            renderedText = `${renderedText}

🗺️ Ver en Google Maps:
${mapUrl}`;
          }

          await this.sendText(socket, conversation, replyJid, renderedText, inboundMessageId);
        }
        index += 1;
        continue;
      }
      if (step.type === "END") {
        if (step.text) {
          await this.sendText(
            socket,
            conversation,
            replyJid,
            interpolate(step.text, variables),
            inboundMessageId,
          );
        }

        await this.conversations.clearFlowState(conversation.id);
        return true;
      }
    }

    await this.conversations.clearFlowState(conversation.id);
    return true;
  }

  private async handle(socket: WASocket, sessionId: string, message: WAMessage): Promise<void> {
    const remoteJid = message.key.remoteJid;
    const messageId = message.key.id;
    if (!remoteJid || !messageId || !message.message || message.key.fromMe) return;
    if (remoteJid.endsWith("@broadcast") || remoteJid === "status@broadcast") return;

    const session = await this.sessions.findById(sessionId);
    if (!session) return;
    const reserved = await this.messages.reserveInboundEvent({ tenantId: session.tenantId, sessionId, whatsappMessageId: messageId });
    if (!reserved) return;

    try {
      await socket.readMessages([message.key]);
      const conversation = await this.conversations.recordInbound({ tenantId: session.tenantId, sessionId, remoteJid, messageId, displayName: message.pushName ?? undefined });
      await this.messages.save({
        tenantId: session.tenantId,
        sessionId,
        conversationId: conversation.id,
        whatsappMessageId: messageId,
        remoteJid,
        participantJid: message.key.participant ?? undefined,
        direction: "INBOUND",
        messageType: getContentType(message.message) ?? "unknownMessage",
        status: "RECEIVED",
        fromMe: false,
        payload: Buffer.from(proto.Message.encode(message.message).finish()),
        messageTimestamp: messageDate(message),
      });

      if (!conversation.sessionBotActive || !conversation.isBotActive) return;
      const handled = await this.runFlow(socket, conversation, remoteJid, messageId, inboundText(message), message);
      if (!handled) await this.sendText(socket, conversation, remoteJid, this.defaultReply, messageId);
    } catch (error) {
      if (error instanceof AutomationSessionBlockedError) {
        logger.warn(
          {
            sessionId,
            messageId,
            blockedStatus: error.status,
          },
          "Respuesta automática detenida porque la sesión quedó pausada/cuarentenada.",
        );
        return;
      }
      await this.messages.releaseInboundEvent(sessionId, messageId);
      throw error;
    }
  }
}
