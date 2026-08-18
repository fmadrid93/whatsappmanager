import assert from "node:assert/strict";
import test from "node:test";
import { readCookie } from "../src/shared/utils/cookies.js";

test("lee una cookie específica", () => {
  assert.equal(readCookie("a=1; waas_refresh=abc%20123; c=3", "waas_refresh"), "abc 123");
});

test("devuelve undefined cuando no existe", () => {
  assert.equal(readCookie("a=1", "waas_refresh"), undefined);
});
