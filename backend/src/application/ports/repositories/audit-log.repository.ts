export interface CreateAuditLogInput {
  tenantId: string;
  actorUserId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  result?: "SUCCESS" | "FAILURE";
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

export interface AuditLogRecord {
  id: string;
  tenantId: string;
  actorUserId: string | null;
  actorEmail: string | null;
  actorName: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  result: string;
  requestId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

export interface AuditLogQuery {
  search?: string;
  action?: string;
  entityType?: string;
  result?: string;
  actorUserId?: string;
  from?: Date;
  to?: Date;
  take: number;
  skip: number;
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

export interface IAuditLogRepository {
  create(input: CreateAuditLogInput): Promise<void>;
  listByTenant(tenantId: string, query: AuditLogQuery): Promise<AuditLogPage>;
  options(tenantId: string): Promise<AuditLogOptions>;
  findEntityByRequestId(tenantId: string, entityType: string, requestId: string): Promise<AuditLogRecord | null>;
}
