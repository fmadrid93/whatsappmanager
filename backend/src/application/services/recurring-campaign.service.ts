import crypto from "node:crypto";
import type { CampaignMessagePayload } from "../../domain/campaign/campaign-message.js";
import { HttpError } from "../../shared/errors/http-error.js";
import type { IExternalConnectorRepository } from "../ports/repositories/external-connector.repository.js";
import type { IMessageQueueRepository } from "../ports/repositories/message-queue.repository.js";
import type {
  IRecurringCampaignRepository,
  RecurringCampaignJerarquiaSelection,
  RecurringCampaignRecord,
  RecurringCampaignSourceType,
} from "../ports/repositories/recurring-campaign.repository.js";
import type { CampaignService } from "./campaign.service.js";
import type { ExternalConnectorService } from "./external-connector.service.js";
import type { PhoneNormalizerService } from "./phone-normalizer.service.js";
import type { Voto1x10HierarchyService } from "./voto1x10-hierarchy.service.js";

const MIN_INTERVAL_MINUTES = 5;
const EMPTY_JERARQUIA_SELECTION: RecurringCampaignJerarquiaSelection = {
  territorioIds: [],
  administradorIds: [],
  gerenteIds: [],
  movilizadorIds: [],
};

function seleccionEstaVacia(seleccion: RecurringCampaignJerarquiaSelection): boolean {
  return (
    seleccion.territorioIds.length === 0 &&
    seleccion.administradorIds.length === 0 &&
    seleccion.gerenteIds.length === 0 &&
    seleccion.movilizadorIds.length === 0
  );
}

export class RecurringCampaignService {
  constructor(
    private readonly repository: IRecurringCampaignRepository,
    private readonly connectorRepository: IExternalConnectorRepository,
    private readonly connectors: ExternalConnectorService,
    private readonly campaigns: CampaignService,
    private readonly messageQueue: IMessageQueueRepository,
    private readonly phones: PhoneNormalizerService,
    private readonly voto1x10Hierarchy: Voto1x10HierarchyService | null,
  ) {}

  async create(input: {
    tenantId: string;
    createdByUserId: string;
    name: string;
    sourceType: RecurringCampaignSourceType;
    connectorId?: string;
    connectorVariables?: Record<string, string>;
    jerarquiaSelection?: RecurringCampaignJerarquiaSelection;
    sessionIds: string[];
    message: CampaignMessagePayload;
    mediaAssetId?: string;
    defaultRegion: string;
    intervalMinutes: number;
  }): Promise<RecurringCampaignRecord> {
    if (!input.name.trim()) throw new HttpError(400, "El nombre es obligatorio.");
    if (input.sessionIds.length === 0) throw new HttpError(400, "Selecciona al menos una sesión.");
    if (!input.message.text.trim() && !input.mediaAssetId) {
      throw new HttpError(400, "El envío recurrente necesita texto o multimedia.");
    }
    if (input.intervalMinutes < MIN_INTERVAL_MINUTES) {
      throw new HttpError(400, `El intervalo mínimo es de ${MIN_INTERVAL_MINUTES} minutos.`);
    }

    let connectorId: string | undefined;
    let jerarquiaSelection = EMPTY_JERARQUIA_SELECTION;

    if (input.sourceType === "CONNECTOR") {
      if (!input.connectorId) throw new HttpError(400, "Selecciona una fuente de contactos.");
      const connector = await this.connectorRepository.findById(input.tenantId, input.connectorId);
      if (!connector) throw new HttpError(404, "Conector no encontrado.");
      if (connector.purpose !== "CONTACT_SOURCE") {
        throw new HttpError(400, "El conector seleccionado no está configurado como fuente de contactos.");
      }
      connectorId = input.connectorId;
    } else {
      if (!this.voto1x10Hierarchy) {
        throw new HttpError(503, "La integración con el sistema 1x10 no está configurada.");
      }
      if (!input.jerarquiaSelection || seleccionEstaVacia(input.jerarquiaSelection)) {
        throw new HttpError(400, "Selecciona al menos un territorio, administrador, gerente o movilizador.");
      }
      jerarquiaSelection = input.jerarquiaSelection;
    }

    return this.repository.create({
      id: crypto.randomUUID(),
      tenantId: input.tenantId,
      createdByUserId: input.createdByUserId,
      sourceType: input.sourceType,
      connectorId,
      jerarquiaSelection,
      mediaAssetId: input.mediaAssetId,
      name: input.name.trim(),
      connectorVariables: input.connectorVariables ?? {},
      sessionIds: [...new Set(input.sessionIds)],
      message: input.message,
      defaultRegion: input.defaultRegion,
      intervalMinutes: Math.round(input.intervalMinutes),
    });
  }

  list(tenantId: string) {
    return this.repository.listByTenant(tenantId);
  }

  async pause(tenantId: string, id: string): Promise<void> {
    const record = await this.repository.findByIdForTenant(id, tenantId);
    if (!record) throw new HttpError(404, "Envío recurrente no encontrado.");
    await this.repository.setStatus(id, tenantId, "PAUSED");
  }

  async resume(tenantId: string, id: string): Promise<void> {
    const record = await this.repository.findByIdForTenant(id, tenantId);
    if (!record) throw new HttpError(404, "Envío recurrente no encontrado.");
    await this.repository.setStatus(id, tenantId, "ACTIVE");
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const record = await this.repository.findByIdForTenant(id, tenantId);
    if (!record) throw new HttpError(404, "Envío recurrente no encontrado.");
    await this.repository.delete(id, tenantId);
  }

  /** Todas las campañas activas cuyo intervalo ya venció y deben correr ahora. */
  async listDue(now: Date): Promise<RecurringCampaignRecord[]> {
    const active = await this.repository.listActive();
    return active.filter((record) => this.isDue(record, now));
  }

  private isDue(record: RecurringCampaignRecord, now: Date): boolean {
    if (!record.lastRunAt) return true;
    const elapsedMs = now.getTime() - record.lastRunAt.getTime();
    return elapsedMs >= record.intervalMinutes * 60_000;
  }

  /**
   * Ejecuta una corrida: trae contactos del conector, descarta los que ya
   * tienen algún registro histórico en la cola de este tenant (ya
   * contactados o encolados alguna vez) y arranca una campaña de una sola
   * vez con el resto. No lanza: cualquier error queda registrado en
   * lastRunError para que se vea en el panel.
   */
  async runOnce(record: RecurringCampaignRecord): Promise<void> {
    const ranAt = new Date();
    try {
      let contacts: Array<{ name?: string; phone: string; variables: Record<string, string> }>;

      if (record.sourceType === "CONNECTOR") {
        if (!record.connectorId) {
          await this.repository.recordRunResult(record.id, {
            outcome: "ERROR",
            contactsFound: 0,
            contactsNew: 0,
            errorMessage: "Este envío recurrente no tiene conector configurado.",
            ranAt,
          });
          return;
        }
        const preview = await this.connectors.previewContacts({
          tenantId: record.tenantId,
          connectorId: record.connectorId,
          variables: record.connectorVariables,
        });

        if (preview.outcome === "ERROR") {
          await this.repository.recordRunResult(record.id, {
            outcome: "ERROR",
            contactsFound: 0,
            contactsNew: 0,
            errorMessage: preview.errorMessage ?? "Error al consultar el conector de contactos.",
            ranAt,
          });
          return;
        }
        contacts = preview.contacts;
      } else {
        if (!this.voto1x10Hierarchy) {
          await this.repository.recordRunResult(record.id, {
            outcome: "ERROR",
            contactsFound: 0,
            contactsNew: 0,
            errorMessage: "La integración con el sistema 1x10 no está configurada.",
            ranAt,
          });
          return;
        }
        const resultado = await this.voto1x10Hierarchy.getContactosPorSeleccion(record.jerarquiaSelection);
        contacts = resultado.contacts.map((contact) => ({ name: contact.name, phone: contact.phone, variables: {} }));
      }

      const normalizedByE164 = new Map<string, { name?: string; raw: string; variables: Record<string, string> }>();
      for (const contact of contacts) {
        const result = this.phones.tryNormalize(contact.phone, record.defaultRegion);
        if (!result.ok) continue;
        if (!normalizedByE164.has(result.value.e164)) {
          normalizedByE164.set(result.value.e164, {
            name: contact.name,
            raw: contact.phone,
            variables: contact.variables,
          });
        }
      }

      const allE164 = [...normalizedByE164.keys()];
      const existing = await this.messageQueue.findExistingRecipients(record.tenantId, allE164);
      const freshContacts = allE164
        .filter((e164) => !existing.has(e164))
        .map((e164) => {
          const contact = normalizedByE164.get(e164)!;
          return { name: contact.name, phone: contact.raw, variables: contact.variables };
        });

      if (freshContacts.length === 0) {
        await this.repository.recordRunResult(record.id, {
          outcome: "EMPTY",
          contactsFound: allE164.length,
          contactsNew: 0,
          ranAt,
        });
        return;
      }

      const stamp = ranAt.toISOString().slice(0, 16).replace("T", " ");
      const created = await this.campaigns.create({
        tenantId: record.tenantId,
        ownerUserId: record.createdByUserId,
        name: `${record.name} · ${stamp}`,
        sessionIds: record.sessionIds,
        contacts: freshContacts,
        message: record.message,
        mediaAssetId: record.mediaAssetId,
        defaultRegion: record.defaultRegion,
      });
      await this.campaigns.start(record.tenantId, created.id);

      await this.repository.recordRunResult(record.id, {
        outcome: "CREATED",
        contactsFound: allE164.length,
        contactsNew: freshContacts.length,
        campaignId: created.id,
        ranAt,
      });
    } catch (error) {
      await this.repository.recordRunResult(record.id, {
        outcome: "ERROR",
        contactsFound: 0,
        contactsNew: 0,
        errorMessage: error instanceof Error ? error.message : String(error),
        ranAt,
      });
    }
  }
}
