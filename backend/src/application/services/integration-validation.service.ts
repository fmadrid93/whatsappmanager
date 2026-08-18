import crypto from "node:crypto";
import type { IObjectStorage } from "../ports/storage/object-storage.js";
import type { ISessionRepository } from "../ports/repositories/session.repository.js";
import type { IWorkerNodeRepository } from "../ports/repositories/worker-node.repository.js";
import type { IDatabaseProbe } from "../ports/system/database-probe.js";

export interface IntegrationProbeResult {
  decision: "PASS" | "FAIL";
  realModes: boolean;
  checks: {
    database: ProbeCheck;
    storage: ProbeCheck & {
      key?: string;
      sizeBytes?: number;
      roundTripVerified?: boolean;
    };
    workers: ProbeCheck & { activeCount: number };
    sessions: ProbeCheck & {
      total: number;
      connected: number;
      requestedSessionId?: string;
      requestedSessionStatus?: string;
    };
  };
  modes: {
    whatsappGateway: string;
    objectStorage: string;
  };
  generatedAt: string;
}

interface ProbeCheck {
  status: "PASS" | "FAIL" | "SKIPPED";
  durationMs: number;
  message?: string;
}

export class IntegrationValidationService {
  constructor(
    private readonly database: IDatabaseProbe,
    private readonly storage: IObjectStorage,
    private readonly sessions: ISessionRepository,
    private readonly workers: IWorkerNodeRepository,
    private readonly modes: { whatsappGateway: string; objectStorage: string },
  ) {}

  async run(input: {
    tenantId: string;
    sessionId?: string;
    requireConnectedSession: boolean;
    performStorageRoundTrip: boolean;
  }): Promise<IntegrationProbeResult> {
    const database = await this.check(async () => this.database.ping());

    const storage = input.performStorageRoundTrip
      ? await this.storageRoundTrip(input.tenantId)
      : {
          status: "SKIPPED" as const,
          durationMs: 0,
          message: "Prueba de escritura/lectura/eliminación omitida.",
        };

    const workerStarted = Date.now();
    let activeWorkers = 0;
    let workerCheck: ProbeCheck;
    try {
      activeWorkers = (await this.workers.listActive(new Date())).length;
      workerCheck = {
        status: activeWorkers > 0 ? "PASS" : "FAIL",
        durationMs: Date.now() - workerStarted,
        message: activeWorkers > 0
          ? `${activeWorkers} Worker(s) activo(s).`
          : "No se detectaron Workers activos.",
      };
    } catch (error) {
      workerCheck = this.failedCheck(workerStarted, error);
    }

    const sessionStarted = Date.now();
    const tenantSessions = await this.sessions.listByTenant(input.tenantId);
    const connected = tenantSessions.filter((item) => item.status === "CONNECTED").length;
    const requested = input.sessionId
      ? tenantSessions.find((item) => item.id === input.sessionId)
      : undefined;
    const requestedConnected = !input.sessionId || requested?.status === "CONNECTED";
    const sessionPass = input.requireConnectedSession
      ? connected > 0 && requestedConnected
      : true;
    const sessionMessage = input.requireConnectedSession
      ? sessionPass
        ? "Existe una sesión WhatsApp conectada y disponible."
        : input.sessionId && !requested
          ? "La sesión solicitada no pertenece al tenant."
          : input.sessionId
            ? `La sesión solicitada está en estado ${requested?.status ?? "DESCONOCIDO"}.`
            : "No existe ninguna sesión WhatsApp conectada."
      : `${connected} de ${tenantSessions.length} sesiones conectadas.`;

    const realModes = this.modes.whatsappGateway === "BAILEYS" && this.modes.objectStorage === "S3";
    const requiredChecksPass = database.status === "PASS"
      && storage.status !== "FAIL"
      && workerCheck.status === "PASS"
      && sessionPass
      && realModes;

    return {
      decision: requiredChecksPass ? "PASS" : "FAIL",
      realModes,
      checks: {
        database,
        storage,
        workers: { ...workerCheck, activeCount: activeWorkers },
        sessions: {
          status: sessionPass ? "PASS" : "FAIL",
          durationMs: Date.now() - sessionStarted,
          message: sessionMessage,
          total: tenantSessions.length,
          connected,
          requestedSessionId: input.sessionId,
          requestedSessionStatus: requested?.status,
        },
      },
      modes: this.modes,
      generatedAt: new Date().toISOString(),
    };
  }

  private async storageRoundTrip(tenantId: string): Promise<IntegrationProbeResult["checks"]["storage"]> {
    const started = Date.now();
    const key = `tenants/${tenantId}/diagnostics/${crypto.randomUUID()}.txt`;
    const payload = Buffer.from(`whatsapp-saas-integration-probe:${new Date().toISOString()}`, "utf8");
    let uploaded = false;

    try {
      await this.storage.putObject({
        key,
        body: payload,
        contentType: "text/plain",
      });
      uploaded = true;

      const metadata = await this.storage.headObject(key);
      const prefix = await this.storage.readObjectPrefix(key, payload.length);
      const roundTripVerified = metadata.sizeBytes === payload.length && prefix.equals(payload);

      if (!roundTripVerified) {
        throw new Error("El objeto recuperado no coincide con el contenido enviado.");
      }

      await this.storage.deleteObject(key);
      uploaded = false;

      return {
        status: "PASS",
        durationMs: Date.now() - started,
        message: "S3 permitió escribir, consultar, leer y eliminar un objeto privado.",
        key,
        sizeBytes: metadata.sizeBytes,
        roundTripVerified,
      };
    } catch (error) {
      return {
        ...this.failedCheck(started, error),
        key,
        roundTripVerified: false,
      };
    } finally {
      if (uploaded) {
        try {
          await this.storage.deleteObject(key);
        } catch {
          // La respuesta principal ya registra el resultado del round-trip.
          // Un job de limpieza puede eliminar el objeto si AWS rechazó el delete temporalmente.
        }
      }
    }
  }

  private async check(action: () => Promise<void>): Promise<ProbeCheck> {
    const started = Date.now();
    try {
      await action();
      return { status: "PASS", durationMs: Date.now() - started };
    } catch (error) {
      return this.failedCheck(started, error);
    }
  }

  private failedCheck(started: number, error: unknown): ProbeCheck {
    return {
      status: "FAIL",
      durationMs: Date.now() - started,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
