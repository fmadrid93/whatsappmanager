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
  const session = await prisma.whatsAppSession.findFirst({
    where: { name: "asuncion_movil_fmadridmovilizador_linea1" },
  });
  if (!session) {
    console.log("Session not found.");
    return;
  }

  console.log("Current session:", session);

  // Set status to CONNECTED since pairing is complete and keys exist
  const updated = await prisma.whatsAppSession.update({
    where: { id: session.id },
    data: {
      status: "CONNECTED",
      phoneE164: session.phoneE164 || "+595986125168",
      whatsappJid: session.whatsappJid || "595986125168@s.whatsapp.net",
      lastConnectionCode: 200,
      lastConnectionError: null,
      leaseOwner: null,
      leaseExpiresAt: null,
      qrCode: null,
      pairingCode: null,
    },
  });

  console.log("Updated session:", updated);
}

main().catch(console.error).finally(() => prisma.$disconnect());
