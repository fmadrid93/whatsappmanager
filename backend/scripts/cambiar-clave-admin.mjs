import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const email = (process.argv[2] || process.env.SEED_ADMIN_EMAIL || "admin@demo.local").trim().toLowerCase();
const newPassword = process.argv[3] || process.env.SEED_ADMIN_PASSWORD;

if (!newPassword) {
  console.error("❌ Error: Debes especificar la nueva contraseña.");
  console.log("Uso: node scripts/cambiar-clave-admin.mjs <correo> <nueva-clave>");
  console.log("Ejemplo: node scripts/cambiar-clave-admin.mjs admin@tudominio.com MiClaveSegura2026!");
  process.exit(1);
}

async function main() {
  console.log(`🔐 Actualizando credenciales para: ${email} ...`);
  const passwordHash = await bcrypt.hash(newPassword, 12);

  const user = await prisma.appUser.findUnique({ where: { email } });
  if (user) {
    await prisma.appUser.update({
      where: { email },
      data: {
        passwordHash,
        status: "ACTIVE",
      },
    });
    console.log(`✅ ¡Contraseña actualizada exitosamente para el usuario ${email}!`);
  } else {
    let tenant = await prisma.tenant.findFirst();
    if (!tenant) {
      tenant = await prisma.tenant.create({ data: { name: "Empresa Principal" } });
    }
    await prisma.appUser.create({
      data: {
        tenantId: tenant.id,
        email,
        displayName: "Administrador",
        passwordHash,
        role: "TENANT_ADMIN",
        status: "ACTIVE",
      },
    });
    console.log(`✅ ¡Usuario administrador creado exitosamente con el correo ${email}!`);
  }
}

main()
  .catch((e) => {
    console.error("❌ Error actualizando contraseña:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
