import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

const root = resolve(process.cwd(), "..");
const required = [
  ".env.windows.example",
  "scripts/windows-native/Common.ps1",
  "scripts/windows-native/check-requirements.ps1",
  "scripts/windows-native/configure-environment.ps1",
  "scripts/windows-native/create-database.ps1",
  "scripts/windows-native/generate-sqlserver-baseline.ps1",
  "scripts/windows-native/migrate-database.ps1",
  "scripts/windows-native/build-application.ps1",
  "scripts/windows-native/start-api.ps1",
  "scripts/windows-native/start-worker.ps1",
  "scripts/windows-native/configure-iis.ps1",
  "scripts/windows-native/install-windows-services.ps1",
  "deploy/windows/iis/web.config.template",
];

test("Windows SQL Server Edition contiene sus archivos de despliegue", () => {
  for (const file of required) {
    assert.equal(existsSync(resolve(root, file)), true, `Falta ${file}`);
  }
});

test("el entorno nativo usa SQL Server y Prisma sqlserver", () => {
  const env = readFileSync(resolve(root, ".env.windows.example"), "utf8");
  assert.match(env, /PRISMA_PROVIDER=sqlserver/);
  assert.match(env, /DATABASE_URL=sqlserver:\/\//);
  assert.doesNotMatch(env, /@postgres:5432/);
});

test("los servicios usan Node env-file y no guardan secretos en XML fijo", () => {
  const service = readFileSync(resolve(root, "scripts/windows-native/install-windows-services.ps1"), "utf8");
  assert.match(service, /--env-file/);
  assert.doesNotMatch(service, /AWS_SECRET_ACCESS_KEY=/);
});

test("IIS publica Angular y proxifica API al loopback", () => {
  const config = readFileSync(resolve(root, "deploy/windows/iis/web.config.template"), "utf8");
  assert.match(config, /127\.0\.0\.1:__API_PORT__/);
  assert.match(config, /Angular Routes/);
});
