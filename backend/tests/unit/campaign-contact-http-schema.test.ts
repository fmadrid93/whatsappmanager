import assert from "node:assert/strict";
import test from "node:test";
import { campaignContactSchema } from "../../src/api/routes.js";

test("el esquema HTTP permite teléfonos cortos para clasificarlos como inválidos sin rechazar el lote", () => {
  const parsed = campaignContactSchema.parse({
    name: "Registro malo",
    phone: "123",
  });

  assert.equal(parsed.phone, "123");
});

test("el esquema HTTP permite teléfono vacío para que el normalizador lo reporte", () => {
  const parsed = campaignContactSchema.parse({
    name: "Sin teléfono",
    phone: "",
  });

  assert.equal(parsed.phone, "");
});
