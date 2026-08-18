import assert from "node:assert/strict";
import test from "node:test";
import { buildDispatchPlan } from "../../src/domain/queue/dispatch-plan.js";

test("reparte slots por sesión sin superar el máximo global", () => {
  const plan = buildDispatchPlan({ sessionIds: ["s1", "s2", "s3"], activeBySession: new Map(), sessionConcurrency: 2, totalInFlight: 0, maxInFlight: 4 });
  assert.deepEqual(plan, ["s1", "s2", "s3", "s1"]);
});

test("respeta slots ya ocupados", () => {
  const plan = buildDispatchPlan({ sessionIds: ["s1", "s2"], activeBySession: new Map([["s1", 2], ["s2", 1]]), sessionConcurrency: 2, totalInFlight: 3, maxInFlight: 10 });
  assert.deepEqual(plan, ["s2"]);
});

test("no despacha cuando el máximo global ya está ocupado", () => {
  assert.deepEqual(buildDispatchPlan({ sessionIds: ["s1"], activeBySession: new Map(), sessionConcurrency: 4, totalInFlight: 20, maxInFlight: 20 }), []);
});
