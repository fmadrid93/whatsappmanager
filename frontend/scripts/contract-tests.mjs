import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const src = path.join(root, "src");

function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? files(full) : [full];
  });
}

const sourceFiles = files(src).filter((file) => /\.(ts|html|css)$/.test(file));
const joined = sourceFiles.map((file) => fs.readFileSync(file, "utf8")).join("\n");
assert.doesNotMatch(joined, /\blocalStorage\b|\bsessionStorage\b/, "Los tokens no deben persistirse en Web Storage.");

const auth = fs.readFileSync(path.join(src, "app/core/auth.service.ts"), "utf8");
assert.match(auth, /signal<string \| null>\(null\)/, "El access token debe permanecer en memoria.");
assert.match(auth, /withCredentials:\s*true/, "La renovación debe usar cookie HttpOnly.");

const interceptor = fs.readFileSync(path.join(src, "app/core/auth.interceptor.ts"), "utf8");
assert.match(interceptor, /Authorization:\s*`Bearer \$\{token\}`/);
assert.match(interceptor, /error\.status === 401/);

const routes = fs.readFileSync(path.join(src, "app/app.routes.ts"), "utf8");
for (const route of ["sessions", "campaigns", "flows", "conversations", "audit", "integrations"]) {
  assert.match(routes, new RegExp(`path: ["']${route}["'][\\s\\S]*?canActivate: \\[authGuard\\]`));
}

const api = fs.readFileSync(path.join(src, "app/core/api.service.ts"), "utf8");
assert.match(api, /externalConnectors\(/, "La API del frontend debe exponer conectores salientes.");
assert.match(api, /previewExternalContacts\(/, "La API del frontend debe permitir importar contactos externos.");

const flows = fs.readFileSync(path.join(src, "app/pages/flows.component.ts"), "utf8");
assert.match(flows, /API_REQUEST/, "El editor de flujos debe incluir el bloque API_REQUEST.");
assert.match(flows, /Integraciones → Conectores/, "El inspector debe orientar la selección del conector del bot.");

const integrations = fs.readFileSync(path.join(src, "app/pages/integrations.component.ts"), "utf8");
assert.match(integrations, /app-external-connectors/, "Integraciones debe mostrar los conectores salientes.");

const campaigns = fs.readFileSync(path.join(src, "app/pages/campaigns.component.ts"), "utf8");
assert.match(campaigns, /result\.outcome === "ERROR"/, "La importación externa debe mostrar fallos sin convertirlos en una lista vacía exitosa.");
assert.match(campaigns, /No hay fuentes activas/, "Campañas debe orientar al usuario cuando aún no existen fuentes de contactos.");

const connectors = fs.readFileSync(path.join(src, "app/pages/external-connectors.component.ts"), "utf8");
assert.match(connectors, /authType/, "El editor de conectores debe administrar la autenticación separada de los encabezados visibles.");

console.log(`PASS frontend contract tests (${sourceFiles.length} archivos inspeccionados).`);
