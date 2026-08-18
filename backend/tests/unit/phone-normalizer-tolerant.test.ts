import assert from "node:assert/strict";
import test from "node:test";
import { PhoneNormalizerService } from "../../src/application/services/phone-normalizer.service.js";

test("Paraguay normaliza formatos locales e internacionales tolerantes", () => {
  const service = new PhoneNormalizerService();
  const values = [
    "0986125168",
    "+0986125168",
    "986125168",
    "5950986125168",
    "+5950986125168",
    "595986125168",
    "+595986125168",
  ];

  for (const value of values) {
    assert.equal(service.normalize(value, "PY").e164, "+595986125168", value);
  }
});

test("tryNormalize no lanza por teléfono inválido", () => {
  const result = new PhoneNormalizerService().tryNormalize("123", "PY");
  assert.equal(result.ok, false);
});
