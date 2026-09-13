import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function testApi() {
  const loginRes = await fetch("http://127.0.0.1:3000/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "fmadrid@liberales26.com",
      password: "clave-del-usuario-o-token",
    }),
  });
  console.log("Login response status:", loginRes.status);
}

// Check latest sessions in database
async function main() {
  const tenant = await prisma.tenant.findFirst();
  console.log("Tenant:", tenant?.id, tenant?.name);

  const activeSessions = await prisma.whatsAppSession.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
  console.log("Active sessions count:", activeSessions.length);
  for (const s of activeSessions) {
    console.log(`- ${s.name} (${s.id}): status=${s.status}, method=${s.pairingMethod}, expectedPhone=${s.expectedPhoneE164}, code=${s.pairingCode}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
