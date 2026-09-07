import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

const prisma = new PrismaClient();

async function main() {
  const res1 = await prisma.whatsAppSession.updateMany({
    where: {
      phoneE164: null,
      status: { in: ["QR_REQUIRED", "CONNECTING", "STARTING"] },
      deletedAt: null,
    },
    data: {
      status: "DISCONNECTED",
      leaseOwner: null,
      leaseExpiresAt: null,
      qrCode: null,
      pairingCode: null,
      disconnectReason: "resetLoop",
      lastConnectionError: null,
    },
  });
  console.log(`Sesiones no vinculadas reseteadas: ${res1.count}`);

  const res2 = await prisma.whatsAppSession.updateMany({
    where: {
      status: { in: ["DISCONNECTED", "DELETED", "LOGGED_OUT", "PAIRING_FAILED"] },
    },
    data: {
      leaseOwner: null,
      leaseExpiresAt: null,
    },
  });
  console.log(`Leases liberados: ${res2.count}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
