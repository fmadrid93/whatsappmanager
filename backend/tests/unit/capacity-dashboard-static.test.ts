import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(here, "../..");

test("heartbeat publica CPU RAM y estado de cola", async () => {
  const source = await readFile(path.join(backendRoot, "src/worker/worker-node-heartbeat.ts"), "utf8");
  assert.match(source, /processCpuPercent/);
  assert.match(source, /hostCpuPercent/);
  assert.match(source, /processRssBytes/);
  assert.match(source, /queueInFlight/);
});

test("performance expone progreso y recomendación de workers", async () => {
  const routes = await readFile(path.join(backendRoot, "src/api/routes.ts"), "utf8");
  const capacity = await readFile(
    path.join(backendRoot, "src/domain/scaling/capacity-health.ts"),
    "utf8",
  );

  assert.match(routes, /buildCampaignCapacityHealth/);
  assert.match(routes, /\.\.\.health/);
  assert.match(routes, /workerProcessMemoryMb/);
  assert.match(routes, /campaignSessionsByWorker/);

  assert.match(capacity, /recommendedWorkers/);
  assert.match(capacity, /healthStatus/);
  assert.match(capacity, /recommendation/);
});
