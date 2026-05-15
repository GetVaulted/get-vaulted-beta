import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

/** Prisma 7+: Postgres requires a driver adapter (URL lives in `prisma.config.ts` for Migrate). */
export function createPostgresPrismaClient(connectionString: string): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
}
