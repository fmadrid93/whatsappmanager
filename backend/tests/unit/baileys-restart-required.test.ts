import assert from "node:assert/strict";
import test from "node:test";
import { isRestartRequiredStatus } from "../../src/infrastructure/whatsapp/baileys-session-gateway.js";

test("515 se trata como restartRequired", () => {
  assert.equal(isRestartRequiredStatus(515), true);
  assert.equal(isRestartRequiredStatus(401), false);
  assert.equal(isRestartRequiredStatus(408), false);
  assert.equal(isRestartRequiredStatus(undefined), false);
});
