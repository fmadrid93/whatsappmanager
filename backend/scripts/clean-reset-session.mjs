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
  // Clear any existing auth keys for this session to ensure clean fresh pairing
  const delKeys = await prisma.baileysAuthKey.deleteMany({
    where: {
      session: {
        name: "asuncion_movil_fmadridmovilizador_linea1"
      }
    }
  });
  console.log(`Deleted ${delKeys.count} old auth keys.`);

  // Reset the session record
  const updated = await prisma.whatsAppSession.updateMany({
    where: {
      name: "asuncion_movil_fmadridmovilizador_linea1"
    },
    data: {
      status: "STARTING",
      pairingMethod: "QR",
      expectedPhoneE164: "+595972686891",
      phoneE164: null,
      whatsappJid: null,
      qrCode: null,
      qrUpdatedAt: null,
      pairingCode: null,
      pairingCodeUpdatedAt: null,
      leaseOwner: null,
      leaseExpiresAt: null,
      lastConnectionCode: null,
      lastConnectionError: null,
      disconnectReason: null,
    }
  });
  console.log(`Reset ${updated.count} session records.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
