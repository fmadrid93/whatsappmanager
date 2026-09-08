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
    "0984611543",
    "0981396305",
    "0986160600",
    "0972297298",
  ];

  for (const value of values) {
    const res = service.normalize(value, "PY");
    assert.match(res.e164, /^\+5959\d{8}$/, value);
  }
});

test("Paraguay auto-detecta números aunque defaultRegion sea BO", () => {
  const service = new PhoneNormalizerService();
  assert.equal(service.normalize("0984611543", "BO").e164, "+595984611543");
  assert.equal(service.normalize("0981396305", "BO").e164, "+595981396305");
  assert.equal(service.normalize("0972297298", "BO").e164, "+595972297298");
});

test("tryNormalize no lanza por teléfono inválido", () => {
  const result = new PhoneNormalizerService().tryNormalize("123", "PY");
  assert.equal(result.ok, false);
});
