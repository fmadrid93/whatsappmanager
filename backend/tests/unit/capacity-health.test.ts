import assert from "node:assert/strict";
import test from "node:test";
import { buildCampaignCapacityHealth } from "../../src/domain/scaling/capacity-health.js";

test("50 sesiones con 5 workers de 20 slots queda cubierto", () => {
  const result = buildCampaignCapacityHealth({
    total: 100000,
    sent: 60000,
    failed: 500,
    pending: 39000,
    processing: 100,
    held: 400,
    connectedSessions: 50,
    activeWorkers: 5,
    sessionConcurrency: 2,
    maxInFlight: 20,
    totalWorkerInFlight: 72,
    serverCpuPercent: 43,
    serverMemoryUsedPercent: 57,
  });

  assert.equal(result.recommendedWorkers, 5);
  assert.equal(result.sessionCapacity, 100);
  assert.equal(result.workerCapacity, 100);
  assert.equal(result.effectiveCapacity, 100);
  assert.equal(result.progressPercent, 60.5);
  assert.equal(result.remaining, 39500);
  assert.equal(result.remainingPercent, 39.5);
  assert.equal(result.healthStatus, "HOLGADO");
});

test("recomienda un worker adicional cuando faltan procesos", () => {
  const result = buildCampaignCapacityHealth({
    total: 1000,
    sent: 100,
    failed: 0,
    pending: 880,
    processing: 20,
    held: 0,
    connectedSessions: 50,
    activeWorkers: 4,
    sessionConcurrency: 2,
    maxInFlight: 20,
    totalWorkerInFlight: 80,
    serverCpuPercent: 45,
    serverMemoryUsedPercent: 60,
  });

  assert.equal(result.recommendedWorkers, 5);
  assert.equal(result.healthStatus, "AGREGAR_WORKER");
});

test("no recomienda más workers cuando el servidor ya está saturado", () => {
  const result = buildCampaignCapacityHealth({
    total: 1000,
    sent: 100,
    failed: 0,
    pending: 800,
    processing: 100,
    held: 0,
    connectedSessions: 50,
    activeWorkers: 5,
    sessionConcurrency: 2,
    maxInFlight: 20,
    totalWorkerInFlight: 100,
    serverCpuPercent: 91,
    serverMemoryUsedPercent: 76,
  });

  assert.equal(result.healthStatus, "SERVIDOR_SATURADO");
});
