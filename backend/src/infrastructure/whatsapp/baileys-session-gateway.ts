import { Boom } from "@hapi/boom";
import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  jidNormalizedUser,
  proto,
  type WASocket,
} from "@whiskeysockets/baileys";
import pino from "pino";
import type { ISessionRepository } from "../../application/ports/repositories/session.repository.js";
import type { IBaileysAuthRepository } from "../../application/ports/repositories/baileys-auth.repository.js";
import type { IWhatsAppSocketRegistry } from "../../application/ports/whatsapp/socket-registry.js";
import type { IWhatsAppMessageRepository } from "../../application/ports/repositories/whatsapp-message.repository.js";
import { BaileysAuthStateFactory } from "./baileys-auth-state.factory.js";
import { InboundMessageService } from "../../application/services/inbound-message.service.js";
import { FailoverService } from "../../application/services/failover.service.js";
import { BaileysMessagePersistenceHandler } from "./baileys-message-persistence.handler.js";
import { logger } from "../../shared/logger/logger.js";
import type { ISessionGateway } from "../../application/ports/whatsapp/session-gateway.js";
import { sleep } from "../../shared/utils/delay.js";
import { classifySendFailure } from "../../domain/queue/send-error-classifier.js";

export const BAILEYS_PACKAGE_TARGET = "7.0.0-rc14";

function disconnectCode(error: unknown): number | undefined {
  if (!error) return undefined;
  const possibleBoom = error as Partial<Boom>;
  const direct = possibleBoom.output?.statusCode;
  if (typeof direct === "number") return direct;
  try {
    return new Boom(error instanceof Error ? error : new Error(String(error))).output.statusCode;
  } catch {
    return undefined;
  }
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 1900);
  return String(error ?? "connectionClosed").slice(0, 1900);
}

export function isRestartRequiredStatus(statusCode: number | undefined): boolean {
  return statusCode === DisconnectReason.restartRequired;
}


export function shouldPreserveQuarantine(
  currentStatus: string | undefined,
  intentionallyStopped: boolean,
): boolean {
  return intentionallyStopped && currentStatus === "QUARANTINED";
}

export class BaileysSessionGateway implements ISessionGateway {
  private readonly stoppingSessions = new Set<string>();
  private readonly restartingSessions = new Set<string>();

  constructor(
    private readonly sessions: ISessionRepository,
    private readonly authRepository: IBaileysAuthRepository,
    private readonly registry: IWhatsAppSocketRegistry,
    private readonly inbound: InboundMessageService,
    private readonly messagePersistence: BaileysMessagePersistenceHandler,
    private readonly messages: IWhatsAppMessageRepository,
    private readonly failover: FailoverService,
    private readonly workerId: string,
  ) {}

  async start(sessionId: string): Promise<void> {
    this.stoppingSessions.delete(sessionId);
    if (this.registry.has(sessionId)) return;
    const session = await this.sessions.findById(sessionId);
    if (!session) throw new Error("Sesión no encontrada.");
    if (session.status === "QUARANTINED") {
      logger.warn(
        { sessionId, lastConnectionCode: session.lastConnectionCode, lastConnectionError: session.lastConnectionError },
        "No se iniciará un socket para una sesión en cuarentena.",
      );
      await this.sessions.releaseLease(sessionId, this.workerId);
      return;
    }

    await this.sessions.updateStatus(sessionId, "CONNECTING", {
      lastConnectionAt: new Date(),
      lastConnectionError: null,
    });

    const authFactory = new BaileysAuthStateFactory(this.authRepository);
    const { state, saveCreds } = await authFactory.create(sessionId);
    const { version, isLatest } = await fetchLatestBaileysVersion();

    logger.info(
      {
        sessionId,
        version,
        isLatest,
        baileysPackageTarget: BAILEYS_PACKAGE_TARGET,
        pairingMethod: session.pairingMethod,
        privacyTokenHandling: "BAILEYS_V7_NATIVE",
      },
      "Iniciando socket Baileys con manejo nativo de tokens de privacidad.",
    );

    // No inyectamos TC/CS tokens ni alteramos nodos del protocolo manualmente.
    // Baileys v7 mantiene ese ciclo internamente. Nuestro auth store acepta
    // categorías de claves genéricas para no descartar material nuevo.
    const socket = makeWASocket({
      auth: state,
      version,
      browser: Browsers.macOS("Chrome"),
      printQRInTerminal: false,
      markOnlineOnConnect: false,
      syncFullHistory: false,
      shouldSyncHistoryMessage: () => false,
      generateHighQualityLinkPreview: false,
      logger: pino({ level: "silent" }),
      getMessage: async (key) => {
        if (!key.id) return undefined;
        const payload = await this.messages.getMessagePayload(sessionId, key.id);
        return payload ? proto.Message.decode(payload) : undefined;
      },
    });

    this.registry.set(sessionId, socket);
    socket.ev.on("creds.update", saveCreds);
    this.messagePersistence.register(socket, sessionId);
    this.inbound.register(socket, sessionId);
    this.registerConnectionUpdates(sessionId, socket);

    if (!state.creds.registered && session.pairingMethod === "CODE") {
      await this.generatePairingCode(sessionId, socket, session.expectedPhoneE164);
    }
  }

  async requestPairingCode(sessionId: string, phoneE164?: string): Promise<string> {
    const socket = this.registry.get(sessionId);
    return this.generatePairingCode(sessionId, socket, phoneE164);
  }

  async stop(sessionId: string): Promise<void> {
    if (!this.registry.has(sessionId)) {
      await this.sessions.releaseLease(sessionId, this.workerId);
      return;
    }
    const socket = this.registry.get(sessionId);
    this.registry.delete(sessionId);
    this.stoppingSessions.add(sessionId);
    try {
      (socket as unknown as { end: (error?: Error) => void }).end(new Error("Worker detenido"));
    } catch {
      // La conexión puede haberse cerrado antes.
    }
    await this.sessions.releaseLease(sessionId, this.workerId);
  }

  private async generatePairingCode(sessionId: string, socket: WASocket, phoneE164?: string): Promise<string> {
    const digits = String(phoneE164 ?? "").replace(/\D/g, "");
    if (digits.length < 8) throw new Error("Configura un número válido para generar el código de vinculación.");
    await sleep(1200);
    const code = await socket.requestPairingCode(digits);
    await this.sessions.savePairingCode(sessionId, code);
    logger.info({ sessionId }, "Código de vinculación actualizado.");
    return code;
  }

  private scheduleRestartRequired(sessionId: string): void {
    if (this.restartingSessions.has(sessionId) || this.stoppingSessions.has(sessionId)) return;
    this.restartingSessions.add(sessionId);
    setTimeout(() => {
      void (async () => {
        try {
          if (this.stoppingSessions.has(sessionId) || this.registry.has(sessionId)) return;
          logger.info({ sessionId }, "Reiniciando socket despues de DisconnectReason.restartRequired (515).");
          await this.start(sessionId);
        } catch (error) {
          logger.error({ error, sessionId }, "Fallo el reinicio automatico posterior a 515.");
          await this.sessions.updateStatus(sessionId, "DISCONNECTED", {
            disconnectReason: "restartRequiredReconnectFailed",
            disconnectedAt: new Date(),
            lastConnectionError: errorText(error),
            lastConnectionAt: new Date(),
          });
          await this.sessions.releaseLease(sessionId, this.workerId);
        } finally {
          this.restartingSessions.delete(sessionId);
        }
      })();
    }, 750);
  }

  private registerConnectionUpdates(sessionId: string, socket: WASocket): void {
    socket.ev.on("connection.update", async (update) => {
      try {
        if (update.qr) {
          await this.sessions.saveQr(sessionId, update.qr);
          logger.info({ sessionId }, "QR actualizado.");
        }

        if (update.connection === "open") {
          const current = await this.sessions.findById(sessionId);
          if (current?.status === "QUARANTINED") {
            logger.warn(
              { sessionId, lastConnectionCode: current.lastConnectionCode },
              "Se ignorará connection.open porque la sesión está en cuarentena.",
            );
            this.registry.delete(sessionId);
            this.stoppingSessions.add(sessionId);
            try {
              (socket as unknown as { end: (error?: Error) => void }).end(new Error("Sesión en cuarentena"));
            } catch {
              // El socket puede haberse cerrado al mismo tiempo.
            }
            return;
          }

          const jid = socket.user?.id ? jidNormalizedUser(socket.user.id) : undefined;
          const phone = jid?.endsWith("@s.whatsapp.net") ? jid.split("@")[0] : undefined;
          await this.sessions.updateStatus(sessionId, "CONNECTED", {
            whatsappJid: jid ?? null,
            phoneE164: phone ? `+${phone}` : null,
            connectedAt: new Date(),
            disconnectReason: null,
            lastConnectionCode: 200,
            lastConnectionError: null,
            lastConnectionAt: new Date(),
            clearQr: true,
            clearPairingCode: true,
          });
          logger.info({ sessionId, jid }, "Sesión conectada.");
        }

        if (update.connection === "close") {
          this.registry.delete(sessionId);
          const error = update.lastDisconnect?.error;
          const statusCode = disconnectCode(error);
          const loggedOut = statusCode === DisconnectReason.loggedOut;
          const restartRequired = isRestartRequiredStatus(statusCode);
          const pairingRejected = statusCode === 405;
          const intentionallyStopped = this.stoppingSessions.has(sessionId);
          const currentSession = await this.sessions.findById(sessionId);
          const preserveQuarantine = shouldPreserveQuarantine(currentSession?.status, intentionallyStopped);
          const connectionError = errorText(error);
          const connectionFailure = classifySendFailure({
            statusCode,
            message: connectionError,
          });
          const fatalDisconnect = connectionFailure.kind === "SESSION_FATAL" && !loggedOut;

          if (preserveQuarantine) {
            logger.warn(
              {
                sessionId,
                statusCode,
                lastConnectionCode: currentSession?.lastConnectionCode,
                lastConnectionError: currentSession?.lastConnectionError,
              },
              "Socket cerrado por cuarentena; se conserva el estado QUARANTINED.",
            );
          } else if (restartRequired && !intentionallyStopped) {
            await this.sessions.updateStatus(sessionId, "CONNECTING", {
              disconnectReason: "restartRequired",
              disconnectedAt: new Date(),
              lastConnectionCode: statusCode ?? 515,
              lastConnectionError: connectionError,
              lastConnectionAt: new Date(),
            });
            logger.info({ sessionId, statusCode }, "Baileys solicito reiniciar el socket; no se ejecutara failover.");
            this.scheduleRestartRequired(sessionId);
          } else if (loggedOut) {
            await this.authRepository.clearSession(sessionId);
            await this.sessions.updateStatus(sessionId, "LOGGED_OUT", {
              disconnectReason: "loggedOut",
              disconnectedAt: new Date(),
              lastConnectionCode: statusCode ?? null,
              lastConnectionError: errorText(error),
              lastConnectionAt: new Date(),
              clearQr: true,
              clearPairingCode: true,
            });
            await this.failover.handleLoggedOut(sessionId);
          } else if (pairingRejected) {
            await this.sessions.updateStatus(sessionId, "PAIRING_FAILED", {
              disconnectReason: "405",
              disconnectedAt: new Date(),
              lastConnectionCode: 405,
              lastConnectionError: "WhatsApp rechazó el emparejamiento antes de emitir el QR/código.",
              lastConnectionAt: new Date(),
              clearQr: true,
              clearPairingCode: true,
            });
          } else if (fatalDisconnect) {
            await this.failover.handleFatalFailure(
              sessionId,
              connectionFailure.code,
              connectionFailure.message,
              statusCode,
            );
          } else {
            await this.sessions.updateStatus(sessionId, "DISCONNECTED", {
              disconnectReason: statusCode ? String(statusCode) : "connectionClosed",
              disconnectedAt: new Date(),
              lastConnectionCode: statusCode ?? null,
              lastConnectionError: connectionError,
              lastConnectionAt: new Date(),
            });
            if (!intentionallyStopped) {
              await this.failover.handleTechnicalFailure(
                sessionId,
                statusCode ? `SESSION_DISCONNECTED_${statusCode}` : "SESSION_DISCONNECTED",
                connectionError,
              );
            }
          }

          if (!(restartRequired && !intentionallyStopped)) {
            await this.sessions.releaseLease(sessionId, this.workerId);
          }
          logger.warn(
            {
              sessionId,
              statusCode,
              loggedOut,
              restartRequired,
              pairingRejected,
              intentionallyStopped,
              preserveQuarantine,
            },
            preserveQuarantine
              ? "Sesión en cuarentena; socket cerrado sin reactivar."
              : restartRequired
                ? "Socket requiere reinicio."
                : "Sesión desconectada.",
          );
        }
      } catch (error) {
        logger.error({ error, sessionId }, "Error actualizando estado de conexión.");
      }
    });
  }
}
