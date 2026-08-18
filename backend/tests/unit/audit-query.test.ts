import test from "node:test";
import assert from "node:assert/strict";
import { AuditService } from "../../src/application/services/audit.service.js";

test("la auditoría limita paginación y conserva filtros", async () => {
  let received: any;
  const repository = {
    listByTenant: async (_tenantId: string, query: unknown) => { received = query; return { items: [], total: 0 }; },
  } as any;
  const service = new AuditService(repository);
  await service.list("tenant-1", { action: "CAMPAIGN_STARTED", take: 900, skip: -10 });
  assert.equal(received.action, "CAMPAIGN_STARTED");
  assert.equal(received.take, 500);
  assert.equal(received.skip, 0);
});
