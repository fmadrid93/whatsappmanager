import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const all = await prisma.whatsAppSession.findMany({
    select: {
      id: true,
      name: true,
      status: true,
      pairingMethod: true,
      pairingCode: true,
      phoneE164: true,
      expectedPhoneE164: true,
      leaseOwner: true,
      leaseExpiresAt: true,
    }
  });
  console.log("TOTAL SESIONES:", all.length);
  console.log(JSON.stringify(all, null, 2));
}

main().finally(() => prisma.$disconnect());
