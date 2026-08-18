import assert from "node:assert/strict";
import test from "node:test";
import { triggerPriority } from "../../src/infrastructure/repositories/prisma-bot-flow.repository.js";

test("CONTAINS recinto tiene prioridad sobre ANY", () => {
  const anyDefinition = {
    version: 2 as const,
    trigger: { type: "ANY" as const },
    steps: [{ id: "fin", type: "END" as const }],
  };
  const recintoDefinition = {
    version: 2 as const,
    trigger: { type: "CONTAINS" as const, value: "recinto" },
    steps: [{ id: "fin", type: "END" as const }],
  };

  assert.ok(
    triggerPriority(recintoDefinition, "cual es mi recinto")
      > triggerPriority(anyDefinition, "cual es mi recinto"),
  );
  assert.equal(triggerPriority(recintoDefinition, "hola"), -1);
});
