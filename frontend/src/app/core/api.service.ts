import { Injectable } from "@angular/core";
import { HttpClient, HttpHeaders } from "@angular/common/http";
import { switchMap } from "rxjs";

export interface SessionRecord {
  id: string;
  name: string;
  status: string;
  expectedPhoneE164?: string;
  phoneE164?: string;
  pairingMethod: "QR" | "CODE";
  pairingCode?: string;
  pairingCodeUpdatedAt?: string;
  isBotActive: boolean;
  qrUpdatedAt?: string;
  lastConnectionCode?: number;
  lastConnectionError?: string;
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

export interface CampaignRecord {
  id: string;
  name: string;
  status: string;
  totalMessages: number;
  sentMessages: number;
  failedMessages: number;
  mediaAssetId?: string;
  createdAt: string;
  startedAt?: string;
  pausedAt?: string;
  completedAt?: string;
  cancelledAt?: string;
}


export interface Voto1x10SeleccionInput {
  territorioIds: number[];
  administradorIds: number[];
  gerenteIds: number[];
  movilizadorIds: number[];
}

export interface RecurringCampaignRecord {
  id: string;
  name: string;
  sourceType: "CONNECTOR" | "JERARQUIA";
  connectorId?: string;
  connectorVariables: Record<string, string>;
  jerarquiaSelection: Voto1x10SeleccionInput;
  sessionIds: string[];
  message: { text: string; caption?: string };
  mediaAssetId?: string;
  defaultRegion: string;
  intervalMinutes: number;
  status: "ACTIVE" | "PAUSED";
  lastRunAt?: string;
  lastRunOutcome?: "CREATED" | "EMPTY" | "ERROR";
  lastRunContactsFound?: number;
  lastRunContactsNew?: number;
  lastRunError?: string;
  lastCampaignId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Voto1x10Territorio {
  idTerritorio: number;
  idTerritorioPadre?: number;
  nombrePadre?: string;
  nombre: string;
  tipoTerritorio: string;
}

export interface Voto1x10Usuario {
  idUsuario: number;
  idRol: number;
  rol: string;
  idTerritorio?: number;
  territorio?: string;
  idUsuarioSupervisor?: number;
  /** Login del sistema 1x10 — sirve para vincular con el nombre de la sesión de WhatsApp. */
  usuario?: string;
  nombreCompleto: string;
  totalPersonas: number;
}

export interface Voto1x10Jerarquia {
  territorios: Voto1x10Territorio[];
  administradores: Voto1x10Usuario[];
  gerentes: Voto1x10Usuario[];
  movilizadores: Voto1x10Usuario[];
}

export interface Voto1x10ContactosResult {
  contacts: Array<{ name?: string; phone: string }>;
  movilizadorCount: number;
  personaCount: number;
}

export interface Voto1x10PersonaRepetida {
  idPersonaMovilizada: number;
  nombres: string;
  apellidos: string;
  celular: string;
  idUsuarioMovilizador: number;
  nombreMovilizador: string;
  idTerritorio?: number;
  nombreTerritorio?: string;
  totalRepeticiones: number;
}

export interface CampaignMessageRecord {
  id: string;
  campaignId: string;
  assignedSessionId?: string;
  contactName?: string;
  recipientRaw: string;
  recipientE164?: string;
  status: string;
  attemptCount: number;
  maxAttempts: number;
  sentMessageId?: string;
  lastErrorCode?: string;
  lastErrorMessage?: string;
  createdAt: string;
  updatedAt: string;
  sentAt?: string;
  failedAt?: string;
}

export interface CampaignMessagePage {
  items: CampaignMessageRecord[];
  total: number;
}

export interface CampaignWorkerCapacitySnapshot {
  id: string;
  pid?: number;
  sessionCount: number;
  inFlight: number;
  maxInFlight: number;
  slotUsagePercent: number;
  processCpuPercent: number | null;
  processMemoryMb: number | null;
  activeSessionSlots: number;
  haltedSessions: number;
}

export interface CampaignPerformanceSnapshot {
  campaignId: string;
  total: number;
  pending: number;
  processing: number;
  sent: number;
  failed: number;
  held: number;
  terminal: number;
  remaining: number;
  progressPercent: number;
  remainingPercent: number;
  sentPercent: number;
  processingPercent: number;
  pendingPercent: number;
  heldPercent: number;
  failedPercent: number;
  sentLastMinute: number;
  failedLastMinute: number;
  messagesPerMinute: number;
  connectedSessions: number;
  configuredSessions: number;
  activeWorkers: number;
  workers: CampaignWorkerCapacitySnapshot[];
  server: {
    cpuPercent: number | null;
    memoryUsedPercent: number | null;
    memoryUsedMb: number | null;
    memoryTotalMb: number | null;
    workerProcessMemoryMb: number;
  };
  sessionConcurrency: number;
  maxInFlight: number;
  sessionCapacity: number;
  workerCapacity: number;
  effectiveCapacity: number;
  recommendedWorkers: number;
  slotUsagePercent: number;
  healthStatus: "HOLGADO" | "VIGILAR" | "AGREGAR_WORKER" | "SERVIDOR_SATURADO" | "SIN_SESIONES";
  recommendation: string;
  sendDelayMinMs: number;
  sendDelayMaxMs: number;
  sampleWindowSeconds: number;
  estimatedMinutesRemaining: number | null;
}

export interface CampaignRecoverySession {
  id: string;
  name: string;
  phoneE164?: string;
  status: string;
  alreadyConfigured: boolean;
  leaseOwner?: string;
  leaseExpiresAt?: string;
  lastConnectionCode?: number;
  lastConnectionError?: string;
}

export interface CampaignRecoverySnapshot {
  campaignId: string;
  campaignStatus: string;
  openMessages: number;
  recoverableMessages: number;
  heldRestrictionMessages: number;
  inFlightLockedMessages: number;
  configuredSessions: CampaignRecoverySession[];
  candidateSessions: CampaignRecoverySession[];
  policy: {
    restrictionHeldCode: string;
    restrictionHeldTransferAllowed: boolean;
    note: string;
  };
  lastRecovery?: {
    selectedSessionIds: string[];
    addedSessionIds: string[];
    movedMessages: number;
    heldRestrictionMessages: number;
    inFlightLockedMessages: number;
    untouchedOpenMessages: number;
  };
}

export interface DeadLetterRecord {
  id: string;
  queueItemId: string;
  campaignId: string;
  sessionId?: string;
  recipientE164?: string;
  reasonCode: string;
  reasonMessage: string;
  attemptCount: number;
  failedAt: string;
  resolvedAt?: string;
}

export interface MediaRecord {
  id: string;
  fileName: string;
  mimeType: string;
  mediaKind: string;
  status: string;
}

export interface ConversationRecord {
  id: string;
  sessionId: string;
  sessionName?: string;
  remoteJid: string;
  phoneE164?: string;
  displayName?: string;
  status: "OPEN" | "CLOSED";
  unreadCount: number;
  tags: string[];
  isBotActive: boolean;
  sessionBotActive: boolean;
  assignedAgentId?: string;
  assignedAgentName?: string;
  assignedAgentEmail?: string;
  lastMessageAt?: string;
  lastMessagePreview?: string;
  lastMessageDirection?: "INBOUND" | "OUTBOUND";
  flowId?: string;
  flowName?: string;
  flowNodeId?: string;
  flowAwaitingVariable?: string;
  flowVariables?: Record<string, string>;
  closedAt?: string;
  lastReadAt?: string;
}

export interface ConversationAgentRecord {
  id: string;
  email: string;
  displayName: string;
  role: string;
}

export interface ConversationMessageRecord {
  id: string;
  whatsappMessageId: string;
  direction: "INBOUND" | "OUTBOUND";
  messageType: string;
  status: string;
  text?: string;
  fromMe: boolean;
  messageTimestamp: string;
}

export interface ConversationNoteRecord {
  id: string;
  text: string;
  authorUserId: string;
  authorName: string;
  authorEmail: string;
  createdAt: string;
}


export interface BotFlowApiMapping {
  sourcePath: string;
  targetVariable: string;
  defaultValue?: string;
}

export interface BotFlowMenuOption {
  value: string;
  label: string;
  nextStepId: string;
}

export type BotFlowStep =
  | { id: string; type: "MESSAGE"; text: string }
  | { id: string; type: "QUESTION"; text: string; variable: string }
  | { id: string; type: "MENU"; text: string; variable: string; options: BotFlowMenuOption[]; invalidText?: string }
  | { id: string; type: "CONDITION"; variable: string; operator: "EQUALS" | "CONTAINS" | "EXISTS"; value?: string; ifTrueText: string; ifFalseText?: string }
  | { id: string; type: "API_REQUEST"; connectorId: string; statusVariable: string; mappings: BotFlowApiMapping[]; successText?: string; notFoundText?: string; errorText?: string }
  | { id: string; type: "END"; text?: string };

export interface BotFlowRecord {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  isTemplate: boolean;
  version: number;
  definition: {
    version: 2;
    trigger: { type: "ANY" | "CONTAINS" | "EXACT"; value?: string };
    steps: BotFlowStep[];
  };
  sessionIds: string[];
  createdAt: string;
}

export interface AuditLogRecord {
  id: string;
  actorUserId?: string;
  actorEmail?: string;
  actorName?: string;
  action: string;
  entityType: string;
  entityId?: string;
  result: string;
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface AuditLogPage {
  items: AuditLogRecord[];
  total: number;
}

export interface AuditLogOptions {
  actions: string[];
  entityTypes: string[];
  actors: Array<{ id: string; email: string; displayName: string }>;
}



export interface IntegrationProbeResult {
  decision: "PASS" | "FAIL";
  realModes: boolean;
  modes: { whatsappGateway: string; objectStorage: string };
  checks: {
    database: { status: string; durationMs: number; message?: string };
    storage: { status: string; durationMs: number; message?: string; key?: string; sizeBytes?: number; roundTripVerified?: boolean };
    workers: { status: string; durationMs: number; message?: string; activeCount: number };
    sessions: { status: string; durationMs: number; message?: string; total: number; connected: number; requestedSessionId?: string; requestedSessionStatus?: string };
  };
  generatedAt: string;
}


export interface IntegrationSummary {
  activeApiKeys: number;
  activeWebhooks: number;
  pendingDeliveries: number;
  failedDeliveries: number;
  requests24h: number;
  failedRequests24h: number;
}

export interface IntegrationApiKeyRecord {
  id: string;
  name: string;
  keyPrefix: string;
  permissions: Array<"CAMPAIGN_CREATE" | "CAMPAIGN_STATUS">;
  status: string;
  expiresAt?: string;
  lastUsedAt?: string;
  revokedAt?: string;
  createdAt: string;
  secret?: string;
}

export interface WebhookEndpointRecord {
  id: string;
  name: string;
  url: string;
  events: string[];
  status: string;
  lastSuccessAt?: string;
  lastFailureAt?: string;
  createdAt: string;
  secret?: string;
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
  createdAt: string;
  deliveredAt?: string;
  failedAt?: string;
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
  createdAt: string;
}

export type ExternalConnectorPurpose = "BOT_LOOKUP" | "CONTACT_SOURCE" | "GENERAL";
export type ExternalConnectorOutcome = "SUCCESS" | "NOT_FOUND" | "ERROR";

export interface ExternalConnectorRecord {
  id: string;
  name: string;
  purpose: ExternalConnectorPurpose;
  method: "GET" | "POST";
  urlTemplate: string;
  headers: Record<string, string>;
  bodyTemplate?: string;
  authType: "NONE" | "BEARER" | "API_KEY" | "BASIC";
  authName?: string;
  hasSecret: boolean;
  timeoutMs: number;
  itemsPath?: string;
  phonePath?: string;
  namePath?: string;
  contactMappings: Array<{ sourcePath: string; targetVariable: string }>;
  status: string;
  lastSuccessAt?: string;
  lastFailureAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExternalConnectorExecutionRecord {
  id: string;
  connectorId: string;
  connectorName: string;
  contextType: string;
  contextId?: string;
  outcome: ExternalConnectorOutcome;
  method: string;
  requestUrl: string;
  responseStatus?: number;
  durationMs: number;
  mappedCount: number;
  responsePreview?: string;
  errorMessage?: string;
  createdAt: string;
}

export interface ExternalContactPreview {
  received: number;
  valid: number;
  invalid: number;
  contacts: Array<{ phone: string; name?: string; variables: Record<string, string> }>;
  errors: string[];
  outcome: ExternalConnectorOutcome;
  httpStatus?: number;
  errorMessage?: string;
}

export interface ExternalConnectorTestResult {
  outcome: ExternalConnectorOutcome;
  httpStatus?: number;
  durationMs: number;
  requestUrl: string;
  preview?: string;
  errorMessage?: string;
}

export interface PagedResult<T> { items: T[]; total: number; }

export interface CapacitySnapshot {
  period: string;
  sessions: number;
  activeCampaigns: number;
  pendingMessages: number;
  globalPendingMessages: number;
  messagesReserved: number;
  messagesSent: number;
  limits: {
    maxSessions: number;
    maxConcurrentCampaigns: number;
    maxCampaignContacts: number;
    maxPendingMessages: number;
    monthlyMessageLimit: number;
  };
}

@Injectable({ providedIn: "root" })
export class ApiService {
  constructor(private readonly http: HttpClient) {}

  integrationSummary() { return this.http.get<IntegrationSummary>("/api/integration-management/summary"); }
  integrationApiKeys() { return this.http.get<IntegrationApiKeyRecord[]>("/api/integration-management/api-keys"); }
  createIntegrationApiKey(body: { name: string; permissions: string[]; expiresAt?: string }) {
    return this.http.post<IntegrationApiKeyRecord>("/api/integration-management/api-keys", body);
  }
  revokeIntegrationApiKey(id: string) { return this.http.post<void>(`/api/integration-management/api-keys/${id}/revoke`, {}); }
  integrationWebhooks() {
    return this.http.get<{ items: WebhookEndpointRecord[]; supportedEvents: string[] }>("/api/integration-management/webhooks");
  }
  createIntegrationWebhook(body: { name: string; url: string; events: string[] }) {
    return this.http.post<WebhookEndpointRecord>("/api/integration-management/webhooks", body);
  }
  updateIntegrationWebhook(id: string, body: { name?: string; url?: string; events?: string[]; status?: "ACTIVE" | "DISABLED" }) {
    return this.http.patch<void>(`/api/integration-management/webhooks/${id}`, body);
  }
  testIntegrationWebhook(id: string) { return this.http.post<{ queued: number }>(`/api/integration-management/webhooks/${id}/test`, {}); }
  webhookDeliveries(filters: { webhookId?: string; status?: string; take?: number; skip?: number } = {}) {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => { if (value !== undefined && value !== "") params.set(key, String(value)); });
    return this.http.get<PagedResult<WebhookDeliveryRecord>>(`/api/integration-management/webhook-deliveries?${params.toString()}`);
  }
  retryWebhookDelivery(id: string) { return this.http.post<void>(`/api/integration-management/webhook-deliveries/${id}/retry`, {}); }
  integrationRequests(filters: { statusCode?: number; take?: number; skip?: number } = {}) {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => { if (value !== undefined) params.set(key, String(value)); });
    return this.http.get<PagedResult<IntegrationRequestLogRecord>>(`/api/integration-management/requests?${params.toString()}`);
  }

  externalConnectors(filters: { purpose?: ExternalConnectorPurpose; status?: "ACTIVE" | "DISABLED" } = {}) {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, String(value)); });
    return this.http.get<ExternalConnectorRecord[]>(`/api/integration-management/connectors?${params.toString()}`);
  }
  createExternalConnector(body: {
    name: string;
    purpose: ExternalConnectorPurpose;
    method: "GET" | "POST";
    urlTemplate: string;
    headers: Record<string, string>;
    bodyTemplate?: string;
    authType: "NONE" | "BEARER" | "API_KEY" | "BASIC";
    authName?: string;
    secret?: string;
    timeoutMs: number;
    itemsPath?: string;
    phonePath?: string;
    namePath?: string;
    contactMappings: Array<{ sourcePath: string; targetVariable: string }>;
  }) {
    return this.http.post<ExternalConnectorRecord>("/api/integration-management/connectors", body);
  }
  setExternalConnectorStatus(id: string, status: "ACTIVE" | "DISABLED") {
    return this.http.patch<void>(`/api/integration-management/connectors/${id}/status`, { status });
  }
  testExternalConnector(id: string, variables: Record<string, string>) {
    return this.http.post<ExternalConnectorTestResult>(`/api/integration-management/connectors/${id}/test`, { variables });
  }
  previewExternalContacts(id: string, variables: Record<string, string>) {
    return this.http.post<ExternalContactPreview>(`/api/integration-management/connectors/${id}/preview-contacts`, { variables });
  }
  externalConnectorExecutions(filters: { connectorId?: string; outcome?: ExternalConnectorOutcome; take?: number; skip?: number } = {}) {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => { if (value !== undefined && value !== "") params.set(key, String(value)); });
    return this.http.get<PagedResult<ExternalConnectorExecutionRecord>>(`/api/integration-management/connector-executions?${params.toString()}`);
  }

  capacity() { return this.http.get<CapacitySnapshot>("/api/capacity"); }
  integrationProbe(sessionId?: string, requireConnectedSession = false) {
    return this.http.post<IntegrationProbeResult>("/api/system/integration-probe", {
      sessionId,
      requireConnectedSession,
      performStorageRoundTrip: true,
    });
  }
  version() {
    return this.http.get<{
      name: string;
      version: string;
      environment: string;
      modes: { whatsappGateway: string; objectStorage: string };
    }>("/version");
  }
  sessions() { return this.http.get<SessionRecord[]>("/api/sessions"); }
  createSession(body: { name: string; expectedPhone?: string; pairingMethod: "QR" | "CODE" }) {
    return this.http.post<SessionRecord>("/api/sessions", body);
  }
  sessionQr(id: string) {
    return this.http.get<{
      status: string;
      pairingMethod: "QR" | "CODE";
      pairingCode: string | null;
      pairingCodeUpdatedAt?: string;
      qrDataUrl: string | null;
      qrUpdatedAt?: string;
      lastConnectionCode?: number;
      lastConnectionError?: string;
    }>(`/api/sessions/${id}/qr`);
  }
  requestPairingCode(id: string, phone?: string) {
    return this.http.post<{ code: string }>(`/api/sessions/${id}/pairing-code`, { phone });
  }
  deleteSession(id: string) { return this.http.delete<void>(`/api/sessions/${id}`); }
  setSessionBot(id: string, active: boolean) { return this.http.patch<void>(`/api/sessions/${id}/bot`, { active }); }
  relinkSession(id: string) { return this.http.post<void>(`/api/sessions/${id}/relink`, {}); }

  campaigns() { return this.http.get<CampaignRecord[]>("/api/campaigns"); }
  validateCampaignContacts(body: {
    contacts: Array<{ name?: string; phone: string; variables?: Record<string, string> }>;
    defaultRegion: string;
  }) {
    return this.http.post<CampaignContactValidationResult>("/api/campaigns/contacts/validate", body);
  }
  createCampaign(body: unknown) { return this.http.post<CampaignRecord>("/api/campaigns", body); }
  startCampaign(id: string) { return this.http.post<void>(`/api/campaigns/${id}/start`, {}); }
  pauseCampaign(id: string) { return this.http.post<void>(`/api/campaigns/${id}/pause`, {}); }
  resumeCampaign(id: string) { return this.http.post<void>(`/api/campaigns/${id}/resume`, {}); }
  cancelCampaign(id: string) { return this.http.post<void>(`/api/campaigns/${id}/cancel`, {}); }
  campaignMessages(id: string, status?: string, take = 500, skip = 0) {
    const params = new URLSearchParams({
      take: String(take),
      skip: String(skip),
    });
    if (status) params.set("status", status);
    return this.http.get<CampaignMessagePage>(`/api/campaigns/${id}/messages?${params.toString()}`);
  }
  campaignPerformance(id: string) {
    return this.http.get<CampaignPerformanceSnapshot>(`/api/campaigns/${id}/performance`);
  }
  campaignRecovery(id: string) {
    return this.http.get<CampaignRecoverySnapshot>(`/api/campaigns/${id}/recovery`);
  }
  recoverCampaignTechnicalPending(id: string, sessionIds: string[]) {
    return this.http.post<CampaignRecoverySnapshot>(`/api/campaigns/${id}/recovery`, { sessionIds });
  }
  deadLetters(id: string) { return this.http.get<DeadLetterRecord[]>(`/api/campaigns/${id}/dead-letters?take=250`); }
  requeueDeadLetter(campaignId: string, deadLetterId: string) {
    return this.http.post<void>(`/api/campaigns/${campaignId}/dead-letters/${deadLetterId}/requeue`, {});
  }

  recurringCampaigns() { return this.http.get<RecurringCampaignRecord[]>("/api/recurring-campaigns"); }
  createRecurringCampaign(body: {
    name: string;
    sessionIds: string[];
    message: { text: string; caption?: string };
    mediaAssetId?: string;
    defaultRegion?: string;
    intervalMinutes: number;
  } & (
    | { sourceType: "CONNECTOR"; connectorId: string; connectorVariables: Record<string, string> }
    | { sourceType: "JERARQUIA"; jerarquiaSelection: Voto1x10SeleccionInput }
  )) {
    return this.http.post<RecurringCampaignRecord>("/api/recurring-campaigns", body);
  }
  pauseRecurringCampaign(id: string) { return this.http.post<void>(`/api/recurring-campaigns/${id}/pause`, {}); }
  resumeRecurringCampaign(id: string) { return this.http.post<void>(`/api/recurring-campaigns/${id}/resume`, {}); }
  deleteRecurringCampaign(id: string) { return this.http.delete<void>(`/api/recurring-campaigns/${id}`); }

  voto1x10Jerarquia() { return this.http.get<Voto1x10Jerarquia>("/api/voto1x10/jerarquia"); }
  voto1x10Contactos(seleccion: Voto1x10SeleccionInput) {
    return this.http.post<Voto1x10ContactosResult>("/api/voto1x10/contactos", seleccion);
  }
  voto1x10CelularesRepetidos(params: { idTerritorio?: number; idUsuarioMovilizador?: number }) {
    const query = new URLSearchParams();
    if (params.idTerritorio !== undefined) query.set("idTerritorio", String(params.idTerritorio));
    if (params.idUsuarioMovilizador !== undefined) query.set("idUsuarioMovilizador", String(params.idUsuarioMovilizador));
    const suffix = query.toString();
    return this.http.get<Voto1x10PersonaRepetida[]>(`/api/voto1x10/celulares-repetidos${suffix ? `?${suffix}` : ""}`);
  }

  media() { return this.http.get<MediaRecord[]>("/api/media"); }

  uploadMedia(file: File) {
    return this.version().pipe(
      switchMap((versionInfo) => versionInfo.modes.objectStorage === "MOCK"
        ? this.uploadMediaThroughApi(file)
        : this.uploadMediaDirect(file)),
    );
  }

  /**
   * El modo MOCK vive dentro del proceso de la API y no puede recibir un PUT
   * del navegador sobre una dirección mock://. En desarrollo usamos multipart.
   */
  private uploadMediaThroughApi(file: File) {
    const formData = new FormData();
    formData.append("file", file, file.name);
    return this.http.post<MediaRecord>("/api/media", formData);
  }

  /** En S3 se conserva la carga directa mediante URL firmada. */
  private uploadMediaDirect(file: File) {
    return this.http.post<{
      uploadUrl: string;
      uploadToken: string;
      requiredHeaders: Record<string, string>;
    }>("/api/media/upload-intents", {
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size,
    }).pipe(
      switchMap((intent) => this.http.put(intent.uploadUrl, file, {
        headers: new HttpHeaders(intent.requiredHeaders),
        responseType: "text",
      }).pipe(
        switchMap(() => this.http.post<MediaRecord>("/api/media/upload-intents/confirm", {
          uploadToken: intent.uploadToken,
        })),
      )),
    );
  }

  flows() { return this.http.get<BotFlowRecord[]>("/api/flows"); }
  createFlow(body: unknown) { return this.http.post<BotFlowRecord>("/api/flows", body); }
  setFlowActive(id: string, active: boolean) { return this.http.patch<void>(`/api/flows/${id}/active`, { active }); }
  setFlowTemplate(id: string, isTemplate: boolean) { return this.http.patch<void>(`/api/flows/${id}/template`, { isTemplate }); }
  cloneFlow(id: string, body: { name: string; sessionIds: string[] }) {
    return this.http.post<BotFlowRecord>(`/api/flows/${id}/clone`, body);
  }

  conversations(filters: {
    search?: string;
    mode?: "ALL" | "BOT" | "HUMAN";
    status?: "ALL" | "OPEN" | "CLOSED";
    sessionId?: string;
    assignedAgentId?: string;
    take?: number;
  } = {}) {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== "") params.set(key, String(value));
    });
    return this.http.get<ConversationRecord[]>(`/api/conversations?${params.toString()}`);
  }
  conversationAgents() { return this.http.get<ConversationAgentRecord[]>("/api/conversations/agents"); }
  conversation(id: string) { return this.http.get<ConversationRecord>(`/api/conversations/${id}`); }
  conversationMessages(id: string, take = 100, before?: string) {
    const params = new URLSearchParams({ take: String(take) });
    if (before) params.set("before", before);
    return this.http.get<ConversationMessageRecord[]>(`/api/conversations/${id}/messages?${params.toString()}`);
  }
  sendConversationText(id: string, text: string) {
    return this.http.post<{ outboxId: string; status: string }>(`/api/conversations/${id}/messages`, { text });
  }
  sendDirectConversationText(body: {
    sessionId: string;
    phone: string;
    displayName?: string;
    text: string;
  }) {
    return this.http.post<{ conversationId: string; outboxId: string; status: string }>(
      "/api/conversations/direct-messages",
      body,
    );
  }
  conversationNotes(id: string) { return this.http.get<ConversationNoteRecord[]>(`/api/conversations/${id}/notes`); }
  addConversationNote(id: string, text: string) {
    return this.http.post<ConversationNoteRecord>(`/api/conversations/${id}/notes`, { text });
  }
  updateConversationProfile(id: string, body: { displayName?: string; tags?: string[] }) {
    return this.http.patch<void>(`/api/conversations/${id}/profile`, body);
  }
  markConversationRead(id: string) { return this.http.post<void>(`/api/conversations/${id}/mark-read`, {}); }
  takeOver(id: string) { return this.http.post<void>(`/api/conversations/${id}/take-over`, {}); }
  assignConversation(id: string, agentId: string) { return this.http.post<void>(`/api/conversations/${id}/assign`, { agentId }); }
  release(id: string) { return this.http.post<void>(`/api/conversations/${id}/release`, {}); }
  resetConversationFlow(id: string) { return this.http.post<void>(`/api/conversations/${id}/reset-flow`, {}); }
  closeConversation(id: string) { return this.http.post<void>(`/api/conversations/${id}/close`, {}); }
  reopenConversation(id: string) { return this.http.post<void>(`/api/conversations/${id}/reopen`, {}); }
  auditLogs(filters: {
    search?: string;
    action?: string;
    entityType?: string;
    result?: string;
    actorUserId?: string;
    from?: string;
    to?: string;
    take?: number;
    skip?: number;
  } = {}) {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== "") params.set(key, String(value));
    });
    return this.http.get<AuditLogPage>(`/api/audit-logs?${params.toString()}`);
  }
  auditLogOptions() { return this.http.get<AuditLogOptions>("/api/audit-logs/options"); }
}
