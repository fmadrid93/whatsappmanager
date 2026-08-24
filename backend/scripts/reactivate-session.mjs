import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const envFile = path.resolve("..", ".env");
if (fs.existsSync(envFile)) {
  const content = fs.readFileSync(envFile, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx < 1) continue;
    const key = trimmed.substring(0, idx).trim();
    let val = trimmed.substring(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.substring(1, val.length - 1);
    }
    process.env[key] = val;
  }
}

const prisma = new PrismaClient();

async function main() {
  const updated = await prisma.whatsAppSession.update({
    where: { id: "bd1530b8-7437-4a41-980e-97b16027644c" },
    data: {
      status: "CONNECTING",
      disconnectReason: null,
      lastConnectionCode: null,
      lastConnectionError: null,
      leaseOwner: null,
      leaseExpiresAt: null,
      pairingCode: null,
      pairingCodeUpdatedAt: null,
      qrCode: null,
      qrUpdatedAt: null,
    }
  });
  console.log("Updated session bd1530b8-7437-4a41-980e-97b16027644c:", updated);
}

main().catch(console.error).finally(() => prisma.$disconnect());
