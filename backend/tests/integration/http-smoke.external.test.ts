import assert from "node:assert/strict";
import test from "node:test";

const enabled = process.env.RUN_EXTERNAL_INTEGRATION === "true";
const baseUrl = process.env.TEST_BASE_URL ?? "http://localhost:8080";

test("API publicada responde health y versión", { skip: !enabled }, async () => {
  const health = await fetch(`${baseUrl}/health/live`);
  assert.equal(health.status, 200);
  const body = await health.json() as { status?: string };
  assert.equal(body.status, "alive");

  const versionResponse = await fetch(`${baseUrl}/version`);
  assert.equal(versionResponse.status, 200);
  const version = await versionResponse.json() as { version?: string };
  assert.equal(version.version, process.env.EXPECTED_APP_VERSION ?? "1.2.0-alpha");
});
