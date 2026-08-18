import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import ts from "typescript";

const projectRoot = path.resolve(process.cwd(), "..");
const roots = [
  path.join(projectRoot, "backend", "src"),
  path.join(projectRoot, "backend", "tests"),
  path.join(projectRoot, "frontend", "src"),
];

const files = [];
function walk(directory) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (["node_modules", "dist", ".angular"].includes(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(absolute);
    else if (/\.(ts|tsx)$/.test(entry.name)) files.push(absolute);
  }
}
for (const root of roots) walk(root);

const failures = [];
for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind);
  for (const diagnostic of parsed.parseDiagnostics) {
    const position = diagnostic.start == null ? { line: 0, character: 0 } : parsed.getLineAndCharacterOfPosition(diagnostic.start);
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, " ");
    failures.push(`${path.relative(projectRoot, file)}:${position.line + 1}:${position.character + 1} ${message}`);
  }
}

if (failures.length) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  process.exit(1);
}
console.log(`PASS: sintaxis TypeScript/TSX válida en ${files.length} archivos.`);
