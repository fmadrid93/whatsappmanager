import assert from "node:assert/strict";
import test from "node:test";
import { classifySendFailure } from "../../src/domain/queue/send-error-classifier.js";

test("clasifica un destinatario inexistente como error permanente", () => {
  const result = classifySendFailure(new Error("El número no está registrado en WhatsApp."));
  assert.equal(result.kind, "RECIPIENT_PERMANENT");
  assert.equal(result.code, "RECIPIENT_NOT_AVAILABLE");
});

test("abre circuito ante bloqueo o límite de la sesión", () => {
  const blocked = classifySendFailure({ message: "Forbidden", statusCode: 403 });
  assert.equal(blocked.kind, "SESSION_FATAL");

  const limited = classifySendFailure({ message: "Too many requests", output: { statusCode: 429 } });
  assert.equal(limited.kind, "SESSION_FATAL");
  assert.equal(limited.code, "SESSION_RATE_LIMITED");
});

test("mantiene los timeouts como errores temporales", () => {
  const result = classifySendFailure(new Error("ETIMEDOUT conectando con WhatsApp"));
  assert.equal(result.kind, "TRANSIENT");
});
