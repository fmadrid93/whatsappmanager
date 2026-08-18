import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(here, "../..");

test("package.json apunta a Baileys 7.0.0-rc14", async () => {
  const packageJson = JSON.parse(
    await readFile(path.join(backendRoot, "package.json"), "utf8"),
  ) as { dependencies?: Record<string, string> };

  assert.equal(
    packageJson.dependencies?.["@whiskeysockets/baileys"],
    "7.0.0-rc14",
  );
});

test("el auth store conserva categorías de claves de forma genérica", async () => {
  const source = await readFile(
    path.join(
      backendRoot,
      "src/infrastructure/whatsapp/baileys-auth-state.factory.ts",
    ),
    "utf8",
  );

  assert.match(source, /Object\.entries\(data\)/);
  assert.match(source, /setKey/);
});

test("el gateway usa rc14 y delega privacy tokens a Baileys v7", async () => {
  const source = await readFile(
    path.join(
      backendRoot,
      "src/infrastructure/whatsapp/baileys-session-gateway.ts",
    ),
    "utf8",
  );

  assert.match(source, /BAILEYS_PACKAGE_TARGET = "7\.0\.0-rc14"/);
  assert.match(source, /privacyTokenHandling: "BAILEYS_V7_NATIVE"/);
});
