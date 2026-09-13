import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const sessions = await prisma.whatsAppSession.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      name: true,
      status: true,
      pairingMethod: true,
      expectedPhoneE164: true,
      pairingCode: true,
      lastConnectionCode: true,
      lastConnectionError: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  console.log("=== LAST 10 SESSIONS ===");
  console.log(JSON.stringify(sessions, null, 2));

  const authKeys = await prisma.baileysAuthKey.findMany({
    take: 10,
    select: {
      sessionId: true,
      category: true,
      keyId: true,
    },
  });
  console.log("=== AUTH KEYS (SAMPLE) ===");
  console.log(JSON.stringify(authKeys, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
