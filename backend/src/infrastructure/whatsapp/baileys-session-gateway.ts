import { Boom } from "@hapi/boom";
import makeWASocket, {
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
import { buildProxyAgent, pickBrowserFingerprint } from "./proxy-fingerprint.util.js";
import { env } from "../../shared/config/env.js";

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

let cachedBaileysVersion: { version: [number, number, number]; isLatest: boolean } | null = null;
let lastVersionFetchAt = 0;

async function getCachedBaileysVersion() {
  const now = Date.now();
  if (cachedBaileysVersion && now - lastVersionFetchAt < 24 * 60 * 60 * 1000) {
    return cachedBaileysVersion;
  }
  try {
    cachedBaileysVersion = await fetchLatestBaileysVersion();
    lastVersionFetchAt = now;
    return cachedBaileysVersion;
  } catch {
    return cachedBaileysVersion ?? { version: [2, 3000, 1015901307] as [number, number, number], isLatest: true };
  }
}

export function isRestartRequiredStatus(statusCode: number | undefined): boolean {
  return (
    statusCode === DisconnectReason.restartRequired ||
    statusCode === DisconnectReason.connectionClosed ||
    statusCode === DisconnectReason.connectionReplaced ||
    statusCode === 440 ||
    statusCode === 428 ||
    statusCode === 515 ||
    statusCode === 503
  );
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
  private readonly startingSessions = new Set<string>();
  private readonly qrTimeoutTimers = new Map<string, NodeJS.Timeout>();

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

  private clearQrTimeoutTimer(sessionId: string): void {
    const timer = this.qrTimeoutTimers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.qrTimeoutTimers.delete(sessionId);
    }
  }

  private cleanupSocket(socket?: WASocket, reason = "Socket closed"): void {
    if (!socket) return;
    try {
      socket.ev.removeAllListeners("connection.update");
      socket.ev.removeAllListeners("creds.update");
      socket.ev.removeAllListeners("messages.upsert");
      socket.ws?.removeAllListeners();
      socket.ws?.close();
      (socket as unknown as { end: (error?: Error) => void }).end?.(new Error(reason));
    } catch {
      // El socket puede haberse cerrado antes.
    }
  }

  async start(sessionId: string): Promise<void> {
    this.stoppingSessions.delete(sessionId);
    if (this.registry.has(sessionId)) {
      const existing = this.registry.get(sessionId);
      this.registry.delete(sessionId);
      this.cleanupSocket(existing, "Replacing socket");
    }
    if (this.startingSessions.has(sessionId)) return;
    this.startingSessions.add(sessionId);

    try {
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

      // Si la sesión es nueva o no estaba vinculada con JID, limpiar credenciales previas para garantizar handshake limpio
      if (!session.whatsappJid && !session.phoneE164) {
        await this.authRepository.clearSession(sessionId);
      }

      await this.sessions.updateStatus(sessionId, "CONNECTING", {
        lastConnectionAt: new Date(),
        lastConnectionError: null,
      });

      const authFactory = new BaileysAuthStateFactory(this.authRepository);
      const { state, saveCreds } = await authFactory.create(sessionId);
      const { version, isLatest } = await getCachedBaileysVersion();

      if (this.stoppingSessions.has(sessionId)) {
        return;
      }

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

      const agent = buildProxyAgent(sessionId, {
        proxyUrl: env.PROXY_URL,
        bucketCount: env.PROXY_IP_BUCKET_COUNT,
      });

      const socket = makeWASocket({
        auth: state,
        version,
        agent,
        browser: pickBrowserFingerprint(sessionId),
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
      this.registerConnectionUpdates(sessionId, socket);
      socket.ev.on("creds.update", saveCreds);
      this.messagePersistence.register(socket, sessionId);
      this.inbound.register(socket, sessionId);


      if (!state.creds.registered && session.pairingMethod === "CODE" && session.expectedPhoneE164) {
        // Solo solicitar pairing code si aún no tenemos uno vigente generado en BD
        const fresh = await this.sessions.findById(sessionId);
        if (!fresh?.pairingCode) {
          try {
            await this.generatePairingCode(sessionId, socket, session.expectedPhoneE164);
          } catch (error) {
            logger.error({ error, sessionId }, "Error al generar código de emparejamiento en start()");
          }
        } else {
          logger.info({ sessionId, code: fresh.pairingCode }, "Pairing code ya existente en BD, conservando código.");
        }
      }
    } finally {
      this.startingSessions.delete(sessionId);
    }
  }

  async requestPairingCode(sessionId: string, phoneE164?: string): Promise<string> {
    const session = await this.sessions.findById(sessionId);
    if (session && session.status === "QUARANTINED") {
      await this.sessions.updateStatus(sessionId, "STARTING", {
        lastConnectionError: null,
      });
    }

    let socket = this.registry.has(sessionId) ? this.registry.get(sessionId) : null;
    if (!socket) {
      await this.start(sessionId);
      for (let i = 0; i < 15; i++) {
        await sleep(500);
        if (this.registry.has(sessionId)) {
          socket = this.registry.get(sessionId);
          break;
        }
      }
    }
    if (!socket) throw new Error("No se pudo iniciar el canal de WhatsApp para generar el código.");
    return this.generatePairingCode(sessionId, socket, phoneE164);
  }

  async stop(sessionId: string): Promise<void> {
    this.clearQrTimeoutTimer(sessionId);
    if (!this.registry.has(sessionId)) {
      await this.sessions.releaseLease(sessionId, this.workerId);
      return;
    }
    const socket = this.registry.get(sessionId);
    this.registry.delete(sessionId);
    this.stoppingSessions.add(sessionId);
    try {
      socket.ev.removeAllListeners("connection.update");
      socket.ev.removeAllListeners("creds.update");
      socket.ev.removeAllListeners("messages.upsert");
      socket.ws?.removeAllListeners();
      (socket as unknown as { end: (error?: Error) => void }).end(new Error("Worker detenido"));
    } catch {
      // La conexión puede haberse cerrado antes.
    }
    await this.sessions.releaseLease(sessionId, this.workerId);
  }


  private async generatePairingCode(sessionId: string, socket: WASocket, phoneE164?: string): Promise<string> {
    const digits = String(phoneE164 ?? "").replace(/\D/g, "");
    if (digits.length < 8) throw new Error("Configura un número válido para generar el código de vinculación.");

    let lastError: unknown = null;
    await sleep(600);

    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        logger.info({ sessionId, digits, attempt }, "Solicitando código de emparejamiento a WhatsApp Baileys...");
        const code = await socket.requestPairingCode(digits);
        await this.sessions.savePairingCode(sessionId, code);
        logger.info({ sessionId, code }, "¡Código de vinculación generado exitosamente!");

        this.clearQrTimeoutTimer(sessionId);
        const timer = setTimeout(() => {
          void (async () => {
            try {
              const current = await this.sessions.findById(sessionId);
              if (current && current.status !== "CONNECTED") {
                logger.info({ sessionId }, "El código de emparejamiento expiró (TTL de 3 minutos alcanzado).");
                await this.stop(sessionId);
                await this.authRepository.clearSession(sessionId);
                await this.sessions.updateStatus(sessionId, "DISCONNECTED", {
                  disconnectReason: "pairingCodeTimeout",
                  disconnectedAt: new Date(),
                  lastConnectionCode: 408,
                  lastConnectionError: "El código de vinculación expiró. Genera uno nuevo.",
                  clearQr: true,
                  clearPairingCode: true,
                });
              }
            } catch (err) {
              logger.warn({ err, sessionId }, "Error al expirar pairing code por timeout.");
            }
          })();
        }, 180_000);
        this.qrTimeoutTimers.set(sessionId, timer);

        return code;
      } catch (err) {
        lastError = err;
        logger.warn({ sessionId, attempt, err }, "Fallo temporal al solicitar pairing code; reintentando...");
        await sleep(1000);
      }
    }
    throw lastError || new Error("No se pudo generar el código de emparejamiento");
  }

  private scheduleRestartRequired(sessionId: string, delayMs = 1500): void {
    if (this.restartingSessions.has(sessionId) || this.stoppingSessions.has(sessionId)) return;
    this.restartingSessions.add(sessionId);
    setTimeout(() => {
      void (async () => {
        try {
          if (this.stoppingSessions.has(sessionId)) return;
          if (this.registry.has(sessionId)) {
            const oldSocket = this.registry.get(sessionId);
            this.registry.delete(sessionId);
            this.cleanupSocket(oldSocket, "Socket restarting");
          }
          logger.info({ sessionId }, "Reiniciando socket...");
          await this.start(sessionId);
        } catch (error) {
          logger.error({ error, sessionId }, "Fallo el reinicio automatico de socket.");
          await this.sessions.updateStatus(sessionId, "DISCONNECTED", {
            disconnectReason: "reconnectFailed",
            disconnectedAt: new Date(),
            lastConnectionError: errorText(error),
            lastConnectionAt: new Date(),
          });
          await this.sessions.releaseLease(sessionId, this.workerId);
        } finally {
          this.restartingSessions.delete(sessionId);
        }
      })();
    }, delayMs);
  }

  private registerConnectionUpdates(sessionId: string, socket: WASocket): void {
    socket.ev.on("connection.update", async (update) => {
      try {
        if (update.qr) {
          const s = await this.sessions.findById(sessionId);
          if (s?.pairingMethod !== "CODE") {
            await this.sessions.saveQr(sessionId, update.qr);
            logger.info({ sessionId }, "QR actualizado.");

            // Programar expiración automática del QR tras 120 segundos si el usuario no escanea
            this.clearQrTimeoutTimer(sessionId);
            const timer = setTimeout(() => {
              void (async () => {
                try {
                  const current = await this.sessions.findById(sessionId);
                  if (current && current.status !== "CONNECTED") {
                    logger.info({ sessionId }, "El código QR expiró (TTL de 2 minutos alcanzado). Pasando a DISCONNECTED.");
                    await this.stop(sessionId);
                    await this.sessions.updateStatus(sessionId, "DISCONNECTED", {
                      disconnectReason: "qrTimeout",
                      disconnectedAt: new Date(),
                      lastConnectionCode: 408,
                      lastConnectionError: "El código QR expiró sin ser escaneado. Presiona Revincular cuando estés listo.",
                      clearQr: true,
                      clearPairingCode: true,
                    });
                  }
                } catch (err) {
                  logger.warn({ err, sessionId }, "Error al expirar QR por timeout.");
                } finally {
                  this.qrTimeoutTimers.delete(sessionId);
                }
              })();
            }, 120_000);
            this.qrTimeoutTimers.set(sessionId, timer);
          }
        }

        if (update.connection === "open") {
          this.clearQrTimeoutTimer(sessionId);
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
          this.clearQrTimeoutTimer(sessionId);
          this.registry.delete(sessionId);
          this.cleanupSocket(socket, "Socket closed");

          const error = update.lastDisconnect?.error;
          const statusCode = disconnectCode(error);
          const connectionError = errorText(error);
          const normalizedErr = connectionError.toLowerCase();

          const isConflict =
            statusCode === 440 ||
            normalizedErr.includes("conflict") ||
            normalizedErr.includes("stream errored") ||
            normalizedErr.includes("connection replaced");

          const isLoggedOut = statusCode === DisconnectReason.loggedOut || statusCode === 401;
          const isPairingRejected = statusCode === 405;
          const restartRequired = isRestartRequiredStatus(statusCode) || isConflict;
          const intentionallyStopped = this.stoppingSessions.has(sessionId);
          const currentSession = await this.sessions.findById(sessionId);
          const preserveQuarantine = shouldPreserveQuarantine(currentSession?.status, intentionallyStopped);
          const isConnectedSession = Boolean(currentSession?.whatsappJid || currentSession?.phoneE164);
          const isWaitingPairingCode = Boolean(currentSession?.pairingCode) && !currentSession?.whatsappJid && currentSession?.status !== "DISCONNECTED" && currentSession?.status !== "DELETED";

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
          } else if (intentionallyStopped) {
            await this.sessions.releaseLease(sessionId, this.workerId);
          } else if (isPairingRejected) {
            await this.authRepository.clearSession(sessionId);
            await this.sessions.updateStatus(sessionId, "PAIRING_FAILED", {
              disconnectReason: "405",
              disconnectedAt: new Date(),
              lastConnectionCode: 405,
              lastConnectionError: "WhatsApp rechazó el emparejamiento antes de emitir el QR/código. Presiona Revincular para intentar de nuevo.",
              lastConnectionAt: new Date(),
              clearQr: true,
              clearPairingCode: true,
            });
            await this.sessions.releaseLease(sessionId, this.workerId);
          } else if (isWaitingPairingCode) {
            // El código ya fue emitido y estamos esperando que el usuario lo ingrese en su teléfono móvil.
            // NO borrar credenciales ni el código. Reanudar socket para completar el handshake al ingresar el código en el celular.
            logger.info({ sessionId, statusCode, code: currentSession?.pairingCode }, "Socket cerrado temporalmente mientras se espera ingreso de código en móvil; manteniendo pairingCode y reanudando socket.");
            this.scheduleRestartRequired(sessionId, 2000);
          } else if (!isConnectedSession) {
            // Sesión en proceso de emparejamiento (QR o código numérico) que se cerró o expiró
            await this.authRepository.clearSession(sessionId);
            logger.info({ sessionId, statusCode }, "Cierre de socket en sesión no vinculada. Pasando a DISCONNECTED.");
            await this.sessions.updateStatus(sessionId, "DISCONNECTED", {
              disconnectReason: isLoggedOut ? "authRejected" : "qrTimeout",
              disconnectedAt: new Date(),
              lastConnectionCode: statusCode ?? 408,
              lastConnectionError: isLoggedOut
                ? "Credenciales no autorizadas o QR no escaneado a tiempo. Presiona Revincular para generar un nuevo código."
                : "El código QR expiró sin ser escaneado. Presiona Revincular para generar uno nuevo.",
              lastConnectionAt: new Date(),
              clearQr: true,
              clearPairingCode: true,
            });
            await this.sessions.releaseLease(sessionId, this.workerId);
          } else if (isLoggedOut) {
            // Sesión previamente conectada que fue desvinculada por el usuario desde WhatsApp en el teléfono
            logger.warn({ sessionId, statusCode }, "Sesión cerrada por el usuario desde WhatsApp (logged out).");
            await this.authRepository.clearSession(sessionId);
            await this.sessions.updateStatus(sessionId, "LOGGED_OUT", {
              disconnectReason: "loggedOut",
              disconnectedAt: new Date(),
              lastConnectionCode: statusCode ?? 401,
              lastConnectionError: "Sesión cerrada desde el dispositivo móvil. Presiona Revincular para volver a conectar.",
              lastConnectionAt: new Date(),
              whatsappJid: null,
              phoneE164: null,
              clearQr: true,
              clearPairingCode: true,
            });
            await this.failover.handleLoggedOut(sessionId);
            await this.sessions.releaseLease(sessionId, this.workerId);
          } else if (restartRequired) {
            logger.info({ sessionId, statusCode, connectionError }, "Reinicio/reconexión requerida por Baileys; reanudando socket...");
            this.scheduleRestartRequired(sessionId, 2000);
          } else {
            logger.info({ sessionId, statusCode }, "Desconexión transitoria de sesión vinculada; reintentando reconexión automática.");
            this.scheduleRestartRequired(sessionId, 3000);
          }

          logger.warn(
            {
              sessionId,
              statusCode,
              isLoggedOut,
              restartRequired,
              pairingRejected: isPairingRejected,
              intentionallyStopped,
              preserveQuarantine,
            },
            preserveQuarantine
              ? "Sesión en cuarentena; socket cerrado sin reactivar."
              : isLoggedOut
                ? "Sesión cerrada (logged out)."
                : "Desconexión de socket procesada.",
          );
        }
      } catch (error) {
        logger.error({ error, sessionId }, "Error actualizando estado de conexión.");
      }
    });
  }
}
