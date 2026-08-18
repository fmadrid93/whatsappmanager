import test from "node:test";
import assert from "node:assert/strict";
import { HumanHandoffService } from "../../src/application/services/human-handoff.service.js";

test("la respuesta manual se encola y no se envía desde el proceso API", async () => {
  const calls: unknown[] = [];
  const repository = {
    enqueueText: async (input: unknown) => { calls.push(input); return "outbox-1"; },
  } as any;
  const service = new HumanHandoffService(repository);
  const id = await service.sendText("tenant-1", "conversation-1", "user-1", "Hola");
  assert.equal(id, "outbox-1");
  assert.deepEqual(calls, [{ tenantId: "tenant-1", conversationId: "conversation-1", actorUserId: "user-1", text: "Hola" }]);
});

test("reiniciar el flujo valida que la conversación pertenezca al tenant", async () => {
  let cleared = false;
  const repository = {
    findById: async () => ({ id: "conversation-1" }),
    clearFlowState: async () => { cleared = true; },
  } as any;
  const service = new HumanHandoffService(repository);
  await service.resetFlow("tenant-1", "conversation-1");
  assert.equal(cleared, true);
});
