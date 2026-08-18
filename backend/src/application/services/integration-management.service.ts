import crypto from "node:crypto";
import { HttpError } from "../../shared/errors/http-error.js";
import type { ICryptoBox } from "../ports/crypto/crypto-box.js";
import type {
  IIntegrationRepository,
  IntegrationPermission,
} from "../ports/repositories/integration.repository.js";

export const supportedWebhookEvents = [
  "WEBHOOK_TEST",
  "INTEGRATION_CAMPAIGN_CREATED",
  "CAMPAIGN_CREATED",
  "CAMPAIGN_STARTED",
  "CAMPAIGN_PAUSED",
  "CAMPAIGN_RESUMED",
  "CAMPAIGN_CANCELLED",
  "MESSAGE_SENT",
  "MESSAGE_FAILED",
  "SESSION_QUARANTINED",
  "AUTOMATIC_FAILOVER_EXECUTED",
] as const;

export class IntegrationManagementService {
  constructor(
    private readonly repository: IIntegrationRepository,
    private readonly cryptoBox: ICryptoBox,
  ) {}

  private hash(value: string): string {
    return crypto.createHash("sha256").update(value, "utf8").digest("hex");
  }

  async createApiKey(input: {
    tenantId: string;
    createdByUserId: string;
    name: string;
    permissions: IntegrationPermission[];
    expiresAt?: Date;
  }) {
    const secret = `wsk_live_${crypto.randomBytes(32).toString("base64url")}`;
    const record = await this.repository.createApiKey({
      ...input,
      keyPrefix: secret.slice(0, 16),
      keyHash: this.hash(secret),
    });
    return { ...record, secret };
  }

  listApiKeys(tenantId: string) {
    return this.repository.listApiKeys(tenantId);
  }

  async authenticate(secret: string | undefined) {
    if (!secret) return null;
    const record = await this.repository.findActiveApiKeyByHash(this.hash(secret));
    if (record) await this.repository.touchApiKey(record.id);
    return record;
  }

  requirePermission(record: { permissions: readonly IntegrationPermission[] }, permission: IntegrationPermission): void {
    if (!record.permissions.includes(permission)) {
      throw new HttpError(403, `La API key no tiene el permiso ${permission}.`);
    }
  }

  revokeApiKey(tenantId: string, id: string) {
    return this.repository.revokeApiKey(tenantId, id);
  }

  async createWebhook(input: {
    tenantId: string;
    createdByUserId: string;
    name: string;
    url: string;
    events: string[];
  }) {
    const secret = `whsec_${crypto.randomBytes(32).toString("base64url")}`;
    const record = await this.repository.createWebhook({
      ...input,
      secretPayload: this.cryptoBox.encrypt(Buffer.from(secret, "utf8")),
    });
    return { ...record, secret };
  }

  listWebhooks(tenantId: string) {
    return this.repository.listWebhooks(tenantId);
  }

  updateWebhook(input: {
    tenantId: string;
    id: string;
    name?: string;
    url?: string;
    events?: string[];
    status?: "ACTIVE" | "DISABLED";
  }) {
    return this.repository.updateWebhook(input);
  }

  emit(input: {
    tenantId: string;
    eventType: string;
    aggregateType?: string;
    aggregateId?: string;
    payload: Record<string, unknown>;
    webhookId?: string;
  }) {
    return this.repository.enqueueEvent(input);
  }

  testWebhook(tenantId: string, webhookId: string) {
    return this.emit({
      tenantId,
      webhookId,
      eventType: "WEBHOOK_TEST",
      aggregateType: "WebhookEndpoint",
      aggregateId: webhookId,
      payload: { message: "Prueba de webhook generada desde WhatsApp SaaS." },
    });
  }

  listDeliveries(input: {
    tenantId: string;
    webhookId?: string;
    status?: string;
    take?: number;
    skip?: number;
  }) {
    return this.repository.listDeliveries({
      ...input,
      take: Math.min(Math.max(input.take ?? 100, 1), 500),
      skip: Math.max(input.skip ?? 0, 0),
    });
  }

  retryDelivery(tenantId: string, id: string) {
    return this.repository.retryDelivery(tenantId, id);
  }

  listRequestLogs(input: {
    tenantId: string;
    statusCode?: number;
    take?: number;
    skip?: number;
  }) {
    return this.repository.listRequestLogs({
      ...input,
      take: Math.min(Math.max(input.take ?? 100, 1), 500),
      skip: Math.max(input.skip ?? 0, 0),
    });
  }

  logRequest(input: Parameters<IIntegrationRepository["logRequest"]>[0]) {
    return this.repository.logRequest(input);
  }

  counts(tenantId: string) {
    return this.repository.counts(tenantId);
  }

  claimNextDelivery(workerId: string, lockSeconds: number) {
    return this.repository.claimNextDelivery({
      workerId,
      lockExpiresAt: new Date(Date.now() + lockSeconds * 1000),
    });
  }

  decryptWebhookSecret(payload: Buffer): string {
    return this.cryptoBox.decrypt(payload).toString("utf8");
  }

  markDeliverySuccess(input: { id: string; responseStatus: number; responseBody?: string }) {
    return this.repository.markDeliverySuccess(input);
  }

  markDeliveryFailure(input: {
    id: string;
    responseStatus?: number;
    responseBody?: string;
    error: string;
    retryAt: Date;
  }) {
    return this.repository.markDeliveryFailure(input);
  }
}
