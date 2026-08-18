import type {
  AuditLogQuery,
  CreateAuditLogInput,
  IAuditLogRepository,
} from "../ports/repositories/audit-log.repository.js";
import { logger } from "../../shared/logger/logger.js";

export class AuditService {
  constructor(private readonly repository: IAuditLogRepository) {}

  async record(input: CreateAuditLogInput): Promise<void> {
    try {
      await this.repository.create(input);
    } catch (error) {
      logger.error({ error, action: input.action }, "No se pudo persistir la auditoría.");
    }
  }

  list(tenantId: string, query: Partial<AuditLogQuery> = {}) {
    return this.repository.listByTenant(tenantId, {
      ...query,
      take: Math.min(Math.max(query.take ?? 100, 1), 500),
      skip: Math.max(query.skip ?? 0, 0),
    });
  }

  options(tenantId: string) {
    return this.repository.options(tenantId);
  }
}
