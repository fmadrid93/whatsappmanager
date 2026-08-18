import type { IBaileysAuthRepository } from "../ports/repositories/baileys-auth.repository.js";
import type { ISessionRepository, PairingMethod } from "../ports/repositories/session.repository.js";
import { HttpError } from "../../shared/errors/http-error.js";
import { TenantCapacityService } from "./tenant-capacity.service.js";
import { PhoneNormalizerService } from "./phone-normalizer.service.js";

export class SessionService {
  constructor(
    private readonly sessions: ISessionRepository,
    private readonly auth: IBaileysAuthRepository,
    private readonly capacity: TenantCapacityService,
    private readonly phones: PhoneNormalizerService,
    private readonly defaultRegion: string,
  ) {}

  async create(
    tenantId: string,
    ownerUserId: string,
    input: { name: string; expectedPhone?: string; pairingMethod?: PairingMethod },
  ) {
    const name = input.name.trim();
    if (name.length < 2) throw new HttpError(400, "El nombre de sesión es demasiado corto.");
    const pairingMethod: PairingMethod = input.pairingMethod === "CODE" ? "CODE" : "QR";
    let expectedPhoneE164: string | undefined;
    if (input.expectedPhone?.trim()) {
      expectedPhoneE164 = this.phones.normalize(input.expectedPhone, this.defaultRegion).e164;
    }
    if (pairingMethod === "CODE" && !expectedPhoneE164) {
      throw new HttpError(400, "El número esperado es obligatorio cuando usas código de vinculación.");
    }
    await this.capacity.assertSessionCapacity(tenantId);
    return this.sessions.create({ tenantId, ownerUserId, name, expectedPhoneE164, pairingMethod });
  }

  list(tenantId: string) {
    return this.sessions.listByTenant(tenantId);
  }

  async get(tenantId: string, id: string) {
    const session = await this.sessions.findByIdForTenant(id, tenantId);
    if (!session) throw new HttpError(404, "Sesión no encontrada.");
    return session;
  }

  async setBotActive(tenantId: string, id: string, active: boolean): Promise<void> {
    const session = await this.get(tenantId, id);
    if (active && session.status !== "CONNECTED") {
      throw new HttpError(409, "Conecta la sesión antes de activar el bot.");
    }
    await this.sessions.setBotActive(id, tenantId, active);
  }

  async relink(tenantId: string, id: string): Promise<void> {
    const session = await this.get(tenantId, id);
    await this.auth.clearSession(session.id);
    await this.sessions.requestRelink(session.id, tenantId);
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const session = await this.get(tenantId, id);
    await this.auth.clearSession(session.id);
    await this.sessions.archive(session.id, tenantId);
  }
}
