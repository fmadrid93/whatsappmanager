export type IntegrationPermission = "CAMPAIGN_CREATE" | "CAMPAIGN_STATUS";

export interface IntegrationApiKeyRecord {
  id: string;
  tenantId: string;
  createdByUserId: string;
  name: string;
  keyPrefix: string;
  permissions: IntegrationPermission[];
  status: string;
  expiresAt?: Date;
  lastUsedAt?: Date;
  revokedAt?: Date;
  createdAt: Date;
}

export interface AuthenticatedIntegrationKey extends IntegrationApiKeyRecord {}

export interface WebhookEndpointRecord {
  id: string;
  tenantId: string;
  name: string;
  url: string;
  events: string[];
  status: string;
  lastSuccessAt?: Date;
  lastFailureAt?: Date;
  createdAt: Date;
}

export interface WebhookDeliveryRecord {
  id: string;
  webhookId: string;
  webhookName: string;
  eventType: string;
  aggregateType?: string;
  aggregateId?: string;
  status: string;
  attemptCount: number;
  responseStatus?: number;
  responseBody?: string;
  lastError?: string;
  createdAt: Date;
  deliveredAt?: Date;
  failedAt?: Date;
}

export interface ClaimedWebhookDelivery {
  id: string;
  webhookId: string;
  tenantId: string;
  url: string;
  secretPayload: Buffer;
  eventType: string;
  aggregateType?: string;
  aggregateId?: string;
  payload: Buffer;
  attemptCount: number;
  maxAttempts: number;
}

export interface IntegrationRequestLogRecord {
  id: string;
  apiKeyId?: string;
  apiKeyName?: string;
  endpoint: string;
  method: string;
  statusCode: number;
  durationMs: number;
  requestId?: string;
  idempotencyKey?: string;
  remoteIp?: string;
  errorMessage?: string;
  createdAt: Date;
}

export interface IntegrationRequestLogPage {
  items: IntegrationRequestLogRecord[];
  total: number;
}

export interface IIntegrationRepository {
  createApiKey(input: {
    tenantId: string;
    createdByUserId: string;
    name: string;
    keyPrefix: string;
    keyHash: string;
    permissions: IntegrationPermission[];
    expiresAt?: Date;
  }): Promise<IntegrationApiKeyRecord>;
  listApiKeys(tenantId: string): Promise<IntegrationApiKeyRecord[]>;
  findActiveApiKeyByHash(keyHash: string): Promise<AuthenticatedIntegrationKey | null>;
  touchApiKey(id: string): Promise<void>;
  revokeApiKey(tenantId: string, id: string): Promise<void>;

  createWebhook(input: {
    tenantId: string;
    createdByUserId: string;
    name: string;
    url: string;
    secretPayload: Buffer;
    events: string[];
  }): Promise<WebhookEndpointRecord>;
  listWebhooks(tenantId: string): Promise<WebhookEndpointRecord[]>;
  updateWebhook(input: {
    tenantId: string;
    id: string;
    name?: string;
    url?: string;
    events?: string[];
    status?: "ACTIVE" | "DISABLED";
  }): Promise<void>;
  enqueueEvent(input: {
    tenantId: string;
    eventType: string;
    aggregateType?: string;
    aggregateId?: string;
    payload: Record<string, unknown>;
    webhookId?: string;
  }): Promise<number>;
  listDeliveries(input: {
    tenantId: string;
    webhookId?: string;
    status?: string;
    take: number;
    skip: number;
  }): Promise<{ items: WebhookDeliveryRecord[]; total: number }>;
  retryDelivery(tenantId: string, deliveryId: string): Promise<void>;
  claimNextDelivery(input: {
    workerId: string;
    lockExpiresAt: Date;
  }): Promise<ClaimedWebhookDelivery | null>;
  markDeliverySuccess(input: {
    id: string;
    responseStatus: number;
    responseBody?: string;
  }): Promise<void>;
  markDeliveryFailure(input: {
    id: string;
    responseStatus?: number;
    responseBody?: string;
    error: string;
    retryAt: Date;
  }): Promise<void>;

  logRequest(input: {
    tenantId: string;
    apiKeyId?: string;
    endpoint: string;
    method: string;
    statusCode: number;
    durationMs: number;
    requestId?: string;
    idempotencyKey?: string;
    remoteIp?: string;
    errorMessage?: string;
  }): Promise<void>;
  listRequestLogs(input: {
    tenantId: string;
    statusCode?: number;
    take: number;
    skip: number;
  }): Promise<IntegrationRequestLogPage>;
  counts(tenantId: string): Promise<{
    activeApiKeys: number;
    activeWebhooks: number;
    pendingDeliveries: number;
    failedDeliveries: number;
    requests24h: number;
    failedRequests24h: number;
  }>;
}
