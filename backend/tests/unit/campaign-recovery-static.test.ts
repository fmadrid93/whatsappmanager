import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(here, "../..");

async function source(relative: string): Promise<string> {
  return readFile(path.join(backendRoot, relative), "utf8");
}

test("la recuperación manual excluye mensajes retenidos por cuarentena", async () => {
  const queue = await source("src/infrastructure/repositories/prisma-message-queue.repository.ts");

  assert.match(queue, /HELD_SESSION_QUARANTINED/);
  assert.match(queue, /technicalRecoveryWhere/);
  assert.match(queue, /status: "PENDING"/);
  assert.match(queue, /status: "PROCESSING"/);
  assert.match(queue, /MANUAL_RECOVERY_TECHNICAL/);
  assert.match(queue, /Los mensajes retenidos por cuarentena no se transfieren/);
});

test("la recuperación evita mover mensajes que todavía están en vuelo", async () => {
  const queue = await source("src/infrastructure/repositories/prisma-message-queue.repository.ts");

  assert.match(queue, /lockExpiresAt: \{ gt: now \}/);
  assert.match(queue, /lockExpiresAt: \{ lt: now \}/);
  assert.match(queue, /chunkIds\(assignment\.items\.map/);
});

test("reanudar campaña no borra la marca de cuarentena", async () => {
  const campaigns = await source("src/infrastructure/repositories/prisma-campaign.repository.ts");

  assert.match(campaigns, /lastErrorCode: \{ not: "HELD_SESSION_QUARANTINED" \}/);
  assert.match(campaigns, /addSessions/);
  assert.match(campaigns, /status: "CONNECTED"/);
});

test("la API expone recuperación manual y mantiene política de no transferencia de restricciones", async () => {
  const routes = await source("src/api/routes.ts");

  assert.match(routes, /"\/campaigns\/:id\/recovery"/);
  assert.match(routes, /restrictionHeldTransferAllowed: false/);
  assert.match(routes, /CAMPAIGN_TECHNICAL_RECOVERY/);
  assert.match(routes, /recoverTechnicalPending/);
});
