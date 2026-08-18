import fs from "node:fs";
import path from "node:path";

const explicitProvider = process.env.PRISMA_PROVIDER?.toLowerCase();
const url = process.env.DATABASE_URL ?? "postgresql://localhost/example";
const normalized = url.toLowerCase();

let provider;
if (explicitProvider) {
  if (!["postgresql", "mysql", "sqlserver"].includes(explicitProvider)) {
    throw new Error("PRISMA_PROVIDER debe ser postgresql, mysql o sqlserver.");
  }
  provider = explicitProvider;
} else if (normalized.startsWith("postgresql://") || normalized.startsWith("postgres://")) {
  provider = "postgresql";
} else if (normalized.startsWith("mysql://")) {
  provider = "mysql";
} else if (normalized.startsWith("sqlserver://")) {
  provider = "sqlserver";
} else {
  throw new Error("DATABASE_URL debe comenzar con postgresql://, postgres://, mysql:// o sqlserver://");
}

const nativeTypes = {
  postgresql: {
    __ID_NATIVE__: "@db.Uuid",
    __SHORT_NATIVE__: "@db.VarChar(191)",
    __MEDIUM_NATIVE__: "@db.VarChar(1000)",
    __LONG_NATIVE__: "@db.Text",
    __V16_NATIVE__: "@db.VarChar(16)",
    __V32_NATIVE__: "@db.VarChar(32)",
    __V128_NATIVE__: "@db.VarChar(128)",
    __V500_NATIVE__: "@db.VarChar(500)",
    __V2000_NATIVE__: "@db.VarChar(2000)",
  },
  mysql: {
    __ID_NATIVE__: "@db.Char(36)",
    __SHORT_NATIVE__: "@db.VarChar(191)",
    __MEDIUM_NATIVE__: "@db.VarChar(1000)",
    __LONG_NATIVE__: "@db.LongText",
    __V16_NATIVE__: "@db.VarChar(16)",
    __V32_NATIVE__: "@db.VarChar(32)",
    __V128_NATIVE__: "@db.VarChar(128)",
    __V500_NATIVE__: "@db.VarChar(500)",
    __V2000_NATIVE__: "@db.VarChar(2000)",
  },
  sqlserver: {
    __ID_NATIVE__: "@db.UniqueIdentifier",
    __SHORT_NATIVE__: "@db.NVarChar(191)",
    __MEDIUM_NATIVE__: "@db.NVarChar(1000)",
    __LONG_NATIVE__: "@db.NVarChar(Max)",
    __V16_NATIVE__: "@db.NVarChar(16)",
    __V32_NATIVE__: "@db.NVarChar(32)",
    __V128_NATIVE__: "@db.NVarChar(128)",
    __V500_NATIVE__: "@db.NVarChar(500)",
    __V2000_NATIVE__: "@db.NVarChar(2000)",
  },
};

const templatePath = path.resolve("prisma/schema.template.prisma");
const outputPath = path.resolve("prisma/schema.prisma");
let output = fs.readFileSync(templatePath, "utf8").replaceAll("__PROVIDER__", provider);
for (const [token, value] of Object.entries(nativeTypes[provider])) {
  output = output.replaceAll(token, value);
}
fs.writeFileSync(outputPath, output);
console.log(`Prisma provider seleccionado: ${provider}`);
