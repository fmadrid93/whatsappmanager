import assert from "node:assert/strict";
import test from "node:test";
import { mapBaileysStatus } from "../src/domain/messaging/message-status.js";

test("mapea ACK de servidor y lectura", () => {
  assert.equal(mapBaileysStatus(2), "SERVER_ACK");
  assert.equal(mapBaileysStatus(4), "READ");
});

test("usa SUBMITTED para estados desconocidos", () => {
  assert.equal(mapBaileysStatus(undefined), "SUBMITTED");
});
