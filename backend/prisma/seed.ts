import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const email = (process.env.SEED_ADMIN_EMAIL ?? "admin@demo.local").toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? "Cambiar123!";
  const tenantName = process.env.SEED_TENANT_NAME ?? "Empresa Demo";

  let tenant = await prisma.tenant.findFirst({ where: { name: tenantName } });
  if (!tenant) {
    tenant = await prisma.tenant.create({ data: { name: tenantName } });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.appUser.upsert({
    where: { email },
    create: {
      tenantId: tenant.id,
      email,
      displayName: "Administrador",
      passwordHash,
      role: "TENANT_ADMIN",
    },
    update: {
      displayName: "Administrador",
      passwordHash,
      status: "ACTIVE",
      role: "TENANT_ADMIN",
    },
  });

  await prisma.tenantCapacityPolicy.upsert({
    where: { tenantId: tenant.id },
    create: {
      tenantId: tenant.id,
      maxSessions: Number(process.env.DEFAULT_MAX_SESSIONS ?? 5),
      maxConcurrentCampaigns: Number(process.env.DEFAULT_MAX_CONCURRENT_CAMPAIGNS ?? 3),
      maxCampaignContacts: Number(process.env.DEFAULT_MAX_CAMPAIGN_CONTACTS ?? 50000),
      maxPendingMessages: Number(process.env.DEFAULT_MAX_PENDING_MESSAGES ?? 100000),
      monthlyMessageLimit: Number(process.env.DEFAULT_MONTHLY_MESSAGE_LIMIT ?? 1000000),
    },
    update: {},
  });

  console.log(`Tenant: ${tenant.id}`);
  console.log(`Administrador: ${email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
