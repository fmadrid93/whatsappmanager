import assert from "node:assert/strict";
import test from "node:test";
import { distributeRoundRobin } from "../../src/domain/queue/failover-distribution.js";

test("distribuye el saldo sin duplicar mensajes entre las sesiones disponibles", () => {
  const items = ["m1", "m2", "m3", "m4", "m5", "m6", "m7"];
  const assignments = distributeRoundRobin(items, ["session-b", "session-c"]);

  assert.deepEqual(assignments, [
    { targetSessionId: "session-b", items: ["m1", "m3", "m5", "m7"] },
    { targetSessionId: "session-c", items: ["m2", "m4", "m6"] },
  ]);
  assert.deepEqual(assignments.flatMap((assignment) => assignment.items).sort(), [...items].sort());
});

test("no asigna mensajes cuando no existe una sesión de reemplazo", () => {
  assert.deepEqual(distributeRoundRobin(["m1"], []), []);
});
