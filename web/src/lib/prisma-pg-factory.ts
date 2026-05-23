import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient } from "@/generated/prisma/client";

const poolByUrl = new Map<string, Pool>();

function isServerlessRuntime(): boolean {
  return Boolean(
    process.env.NETLIFY ||
      process.env.NETLIFY_DEV ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.VERCEL ||
      process.env.NODE_ENV === "production",
  );
}

function getOrCreatePool(connectionString: string): Pool {
  const cached = poolByUrl.get(connectionString);
  if (cached) return cached;

  const pool = new Pool({
    connectionString,
    max: isServerlessRuntime() ? 1 : 10,
    idleTimeoutMillis: 20_000,
    connectionTimeoutMillis: 15_000,
  });
  poolByUrl.set(connectionString, pool);
  return pool;
}

/** Prisma 7+: Postgres requires a driver adapter (URL lives in `prisma.config.ts` for Migrate). */
export function createPostgresPrismaClient(connectionString: string): PrismaClient {
  const pool = getOrCreatePool(connectionString);
  return new PrismaClient({
    adapter: new PrismaPg(pool),
  });
}
