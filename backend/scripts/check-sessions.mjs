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
  const sessions = await prisma.whatsAppSession.findMany({
    orderBy: { updatedAt: "desc" },
    take: 10,
    select: {
      id: true,
      name: true,
      status: true,
      phoneE164: true,
      expectedPhoneE164: true,
      whatsappJid: true,
      pairingMethod: true,
      pairingCode: true,
      lastConnectionCode: true,
      lastConnectionError: true,
      leaseOwner: true,
      leaseExpiresAt: true,
      updatedAt: true
    }
  });
  console.log("=== SESSIONS IN DB ===");
  console.log(JSON.stringify(sessions, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
