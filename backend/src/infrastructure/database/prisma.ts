import { PrismaClient } from "@prisma/client";
import { logger } from "../../shared/logger/logger.js";

export const prisma = new PrismaClient({
  log:
    process.env.NODE_ENV === "development"
      ? ["warn", "error"]
      : ["error"],
});

export async function connectDatabase(): Promise<void> {
  await prisma.$connect();
  logger.info("Conexión con la base de datos establecida.");
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}
