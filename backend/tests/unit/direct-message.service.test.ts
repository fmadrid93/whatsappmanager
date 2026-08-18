import assert from "node:assert/strict";
import test from "node:test";
import { HumanHandoffService } from "../../src/application/services/human-handoff.service.js";

test("mensaje directo normaliza el teléfono y delega al outbox", async () => {
  let captured: any;
  const service = new HumanHandoffService({
    enqueueDirectText: async (input: any) => {
      captured = input;
      return { conversationId: "conv-1", outboxId: "outbox-1" };
    },
  } as never);

  const result = await service.sendDirectText("tenant-1", "user-1", {
    sessionId: "session-1",
    phone: "+591 726-20787",
    displayName: "Fabricio",
    text: "Hola",
  });

  assert.equal(captured.phoneE164, "+59172620787");
  assert.equal(captured.sessionId, "session-1");
  assert.equal(captured.actorUserId, "user-1");
  assert.equal(captured.displayName, "Fabricio");
  assert.equal(captured.text, "Hola");
  assert.deepEqual(result, { conversationId: "conv-1", outboxId: "outbox-1" });
});

test("mensaje directo exige un número utilizable", () => {
  const service = new HumanHandoffService({} as never);
  assert.throws(
    () => service.sendDirectText("tenant-1", "user-1", {
      sessionId: "session-1",
      phone: "123",
      text: "Hola",
    }),
    /Número inválido/,
  );
});
