import type { ICampaignRepository } from "../ports/repositories/campaign.repository.js";
import type { CampaignContactInput, CampaignMessagePayload } from "../../domain/campaign/campaign-message.js";
import { PhoneNormalizerService } from "./phone-normalizer.service.js";
import { HttpError } from "../../shared/errors/http-error.js";
import crypto from "node:crypto";
import { TenantCapacityService } from "./tenant-capacity.service.js";

interface PreparedCampaignContact {
  name?: string;
  raw: string;
  e164: string;
  variables: Record<string, string>;
}

export interface CampaignContactValidationResult {
  received: number;
  valid: number;
  invalid: number;
  duplicates: number;
  sendable: number;
  normalizedPreview: Array<{ sourceIndex: number; name?: string; raw: string; e164: string }>;
  rejected: Array<{ sourceIndex: number; name?: string; phone: string; reason: string }>;
  duplicatePreview: Array<{ sourceIndex: number; name?: string; phone: string; e164: string }>;
}

export class CampaignService {
  constructor(
    private readonly campaigns: ICampaignRepository,
    private readonly phones: PhoneNormalizerService,
    private readonly capacity: TenantCapacityService,
  ) {}

  private tryNormalizePhone(raw: string, defaultRegion: string):
    | { ok: true; value: { original: string; e164: string; digits: string; regionCode?: string } }
    | { ok: false; error: string } {
    const normalizer = this.phones as PhoneNormalizerService & {
      tryNormalize?: PhoneNormalizerService["tryNormalize"];
      normalize: PhoneNormalizerService["normalize"];
    };

    if (typeof normalizer.tryNormalize === "function") {
      return normalizer.tryNormalize(raw, defaultRegion);
    }

    // Compatibilidad con adaptadores/mocks anteriores que solo implementaban normalize().
    try {
      return { ok: true, value: normalizer.normalize(raw, defaultRegion) };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : `Número telefónico inválido: ${raw}`,
      };
    }
  }

  private prepareContacts(
    contacts: CampaignContactInput[],
    defaultRegion: string,
  ): { contacts: PreparedCampaignContact[]; validation: CampaignContactValidationResult } {
    const unique = new Map<string, PreparedCampaignContact>();
    const normalizedPreview: CampaignContactValidationResult["normalizedPreview"] = [];
    const rejected: CampaignContactValidationResult["rejected"] = [];
    const duplicatePreview: CampaignContactValidationResult["duplicatePreview"] = [];
    let invalid = 0;
    let duplicates = 0;

    contacts.forEach((contact, index) => {
      const sourceIndex = index + 1;
      const result = this.tryNormalizePhone(contact.phone, defaultRegion);

      if (!result.ok) {
        invalid += 1;
        if (rejected.length < 200) {
          rejected.push({
            sourceIndex,
            name: contact.name?.trim() || undefined,
            phone: contact.phone,
            reason: result.error,
          });
        }
        return;
      }

      const normalized = result.value;
      if (unique.has(normalized.e164)) {
        duplicates += 1;
        if (duplicatePreview.length < 200) {
          duplicatePreview.push({
            sourceIndex,
            name: contact.name?.trim() || undefined,
            phone: contact.phone,
            e164: normalized.e164,
          });
        }
        return;
      }

      const prepared: PreparedCampaignContact = {
        name: contact.name?.trim() || undefined,
        raw: contact.phone,
        e164: normalized.e164,
        variables: {
          nombre: contact.name?.trim() || "",
          telefono: normalized.e164,
          ...(contact.variables ?? {}),
        },
      };

      unique.set(normalized.e164, prepared);

      if (normalizedPreview.length < 25) {
        normalizedPreview.push({
          sourceIndex,
          name: prepared.name,
          raw: contact.phone,
          e164: normalized.e164,
        });
      }
    });

    const preparedContacts = [...unique.values()];
    return {
      contacts: preparedContacts,
      validation: {
        received: contacts.length,
        valid: preparedContacts.length,
        invalid,
        duplicates,
        sendable: preparedContacts.length,
        normalizedPreview,
        rejected,
        duplicatePreview,
      },
    };
  }

  validateContacts(input: { contacts: CampaignContactInput[]; defaultRegion: string }): CampaignContactValidationResult {
    return this.prepareContacts(input.contacts, input.defaultRegion).validation;
  }

  async create(input: {
    tenantId: string;
    ownerUserId: string;
    name: string;
    sessionIds: string[];
    contacts: CampaignContactInput[];
    message: CampaignMessagePayload;
    mediaAssetId?: string;
    defaultRegion: string;
  }) {
    if (!input.name.trim()) throw new HttpError(400, "El nombre es obligatorio.");
    if (input.sessionIds.length === 0) throw new HttpError(400, "Selecciona al menos una sesión.");
    if (input.contacts.length === 0) throw new HttpError(400, "Agrega al menos un contacto.");
    if (!input.message.text.trim() && !input.mediaAssetId) throw new HttpError(400, "La campaña necesita texto o multimedia.");

    const prepared = this.prepareContacts(input.contacts, input.defaultRegion);
    if (prepared.contacts.length === 0) {
      throw new HttpError(400, "No hay destinatarios válidos para crear la campaña.");
    }

    const campaignId = crypto.randomUUID();
    await this.capacity.reserveCampaign({
      tenantId: input.tenantId,
      campaignId,
      messageCount: prepared.contacts.length,
    });

    try {
      return await this.campaigns.createWithQueue({
        id: campaignId,
        tenantId: input.tenantId,
        ownerUserId: input.ownerUserId,
        name: input.name.trim(),
        sessionIds: [...new Set(input.sessionIds)],
        contacts: prepared.contacts,
        message: input.message,
        mediaAssetId: input.mediaAssetId,
      });
    } catch (error) {
      await this.capacity.releaseCampaignReservation({
        tenantId: input.tenantId,
        campaignId,
        messageCount: prepared.contacts.length,
      });
      throw error;
    }
  }

  list(tenantId: string) { return this.campaigns.listByTenant(tenantId); }

  async get(tenantId: string, campaignId: string) {
    const campaign = await this.campaigns.findByIdForTenant(campaignId, tenantId);
    if (!campaign) throw new HttpError(404, "Campaña no encontrada.");
    return campaign;
  }

  async start(tenantId: string, campaignId: string): Promise<void> {
    const campaign = await this.campaigns.findByIdForTenant(campaignId, tenantId);
    if (!campaign) throw new HttpError(404, "Campaña no encontrada.");
    await this.campaigns.setPreparing(campaignId, tenantId);
  }

  async pause(tenantId: string, campaignId: string): Promise<void> {
    if (!(await this.campaigns.findByIdForTenant(campaignId, tenantId))) throw new HttpError(404, "Campaña no encontrada.");
    await this.campaigns.pause(campaignId, tenantId);
  }

  async resume(tenantId: string, campaignId: string): Promise<void> {
    const campaign = await this.campaigns.findByIdForTenant(campaignId, tenantId);
    if (!campaign) throw new HttpError(404, "Campaña no encontrada.");
    if (!["PAUSED", "PAUSED_BY_CIRCUIT_BREAKER"].includes(campaign.status)) {
      throw new HttpError(409, "La campaña no está pausada.");
    }
    await this.campaigns.setPreparing(campaignId, tenantId);
  }

  async cancel(tenantId: string, campaignId: string): Promise<void> {
    if (!(await this.campaigns.findByIdForTenant(campaignId, tenantId))) throw new HttpError(404, "Campaña no encontrada.");
    await this.campaigns.cancel(campaignId, tenantId);
  }
}
