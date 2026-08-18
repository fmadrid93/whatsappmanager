import assert from "node:assert/strict";
import test from "node:test";
import { retryDelaySeconds } from "../src/domain/queue/retry-policy.js";

test("el reintento crece con el número de intento", () => {
  assert.equal(retryDelaySeconds(1), 10);
  assert.equal(retryDelaySeconds(5), 50);
});

test("el reintento queda limitado a cinco minutos", () => {
  assert.equal(retryDelaySeconds(100), 300);
});
