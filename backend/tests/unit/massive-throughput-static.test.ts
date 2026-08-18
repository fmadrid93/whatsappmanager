import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(here, "../..");

async function source(relative: string): Promise<string> {
  return readFile(path.join(backendRoot, relative), "utf8");
}

test("Baileys objetivo es rc14", async () => {
  const packageJson = JSON.parse(await source("package.json")) as { dependencies?: Record<string, string> };
  assert.equal(packageJson.dependencies?.["@whiskeysockets/baileys"], "7.0.0-rc14");
});

test("worker masivo mantiene protección de sesión fatal", async () => {
  const worker = await source("src/worker/message-queue-worker.ts");
  assert.match(worker, /buildDispatchPlan/);
  assert.match(worker, /haltedSessions\.add\(sessionId\)/);
  assert.match(worker, /releaseForReconciliation/);
});

test("env limita la concurrencia por sesión", async () => {
  const env = await source("src/shared/config/env.ts");
  assert.match(env, /QUEUE_SESSION_CONCURRENCY/);
  assert.match(env, /max\(4\)\.default\(2\)/);
  assert.match(env, /QUEUE_MAX_INFLIGHT/);
});

test("la validación HTTP deja que el normalizador clasifique teléfonos inválidos", async () => {
  const routes = await source("src/api/routes.ts");
  assert.match(routes, /phone: z\.string\(\)\.max\(100\)/);
  assert.doesNotMatch(routes, /phone: z\.string\(\)\.min\(5\)/);
});


test("el procesamiento masivo conserva los webhooks de Integraciones", async () => {
  const worker = await readFile(
    path.join(backendRoot, "src/worker/message-queue-worker.ts"),
    "utf8",
  );
  const main = await readFile(
    path.join(backendRoot, "src/worker/main.ts"),
    "utf8",
  );

  assert.match(worker, /IntegrationManagementService/);
  assert.match(worker, /eventType: "MESSAGE_SENT"/);
  assert.match(worker, /eventType: "MESSAGE_FAILED"/);
  assert.match(worker, /eventType: "SESSION_QUARANTINED"/);
  assert.match(worker, /eventType: "AUTOMATIC_FAILOVER_EXECUTED"/);
  assert.match(main, /container\.services\.integrationManagementService/);
});
