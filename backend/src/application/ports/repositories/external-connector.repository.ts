export type ExternalConnectorPurpose = "BOT_LOOKUP" | "CONTACT_SOURCE" | "GENERAL";
export type ExternalConnectorMethod = "GET" | "POST";
export type ExternalConnectorAuthType = "NONE" | "BEARER" | "API_KEY" | "BASIC";
export type ExternalConnectorOutcome = "SUCCESS" | "NOT_FOUND" | "ERROR";

export interface ExternalConnectorContactMapping {
  sourcePath: string;
  targetVariable: string;
}

export interface ExternalConnectorRecord {
  id: string;
  tenantId: string;
  createdByUserId: string;
  name: string;
  purpose: ExternalConnectorPurpose;
  method: ExternalConnectorMethod;
  urlTemplate: string;
  headers: Record<string, string>;
  bodyTemplate?: string;
  authType: ExternalConnectorAuthType;
  authName?: string;
  hasSecret: boolean;
  timeoutMs: number;
  itemsPath?: string;
  phonePath?: string;
  namePath?: string;
  contactMappings: ExternalConnectorContactMapping[];
  status: string;
  lastSuccessAt?: Date;
  lastFailureAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ExternalConnectorSecretRecord extends ExternalConnectorRecord {
  secretPayload?: Buffer;
}

export interface ExternalConnectorExecutionRecord {
  id: string;
  tenantId: string;
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
  createdAt: Date;
}

export interface IExternalConnectorRepository {
  create(input: {
    tenantId: string;
    createdByUserId: string;
    name: string;
    purpose: ExternalConnectorPurpose;
    method: ExternalConnectorMethod;
    urlTemplate: string;
    headers: Record<string, string>;
    bodyTemplate?: string;
    authType: ExternalConnectorAuthType;
    authName?: string;
    secretPayload?: Buffer;
    timeoutMs: number;
    itemsPath?: string;
    phonePath?: string;
    namePath?: string;
    contactMappings: ExternalConnectorContactMapping[];
  }): Promise<ExternalConnectorRecord>;
  listByTenant(input: {
    tenantId: string;
    purpose?: ExternalConnectorPurpose;
    status?: string;
  }): Promise<ExternalConnectorRecord[]>;
  findById(tenantId: string, id: string): Promise<ExternalConnectorSecretRecord | null>;
  setStatus(tenantId: string, id: string, status: "ACTIVE" | "DISABLED"): Promise<void>;
  createExecution(input: {
    tenantId: string;
    connectorId: string;
    contextType: string;
    contextId?: string;
    outcome: ExternalConnectorOutcome;
    method: string;
    requestUrl: string;
    responseStatus?: number;
    durationMs: number;
    mappedCount?: number;
    responsePreview?: string;
    errorMessage?: string;
  }): Promise<void>;
  listExecutions(input: {
    tenantId: string;
    connectorId?: string;
    outcome?: ExternalConnectorOutcome;
    take: number;
    skip: number;
  }): Promise<{ items: ExternalConnectorExecutionRecord[]; total: number }>;
  counts(tenantId: string): Promise<{
    activeConnectors: number;
    connectorExecutions24h: number;
    failedConnectorExecutions24h: number;
  }>;
}
