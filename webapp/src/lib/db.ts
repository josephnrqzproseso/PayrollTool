import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

type GlobalForPrisma = typeof globalThis & { prisma?: PrismaClient };
const globalForPrisma = globalThis as GlobalForPrisma;
const connectionString =
  "postgresql://payroll_app:UEPtMjb7gyiaCL14vfHrF30c@localhost:5432/payroll_saas?schema=public";

if (!connectionString) {
  throw new Error("DATABASE_URL is not set.");
}

const adapter = new PrismaPg({ connectionString });

function createPrismaClient() {
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

const cached = globalForPrisma.prisma;
const cachedLooksValid = !!(cached && (cached as unknown as { invitation?: unknown }).invitation);

export const prisma = cachedLooksValid ? cached : createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
