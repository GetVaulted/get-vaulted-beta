import type { Prisma, PrismaClient } from "@/generated/prisma/client";

/**
 * Postgres transaction clock (`now()`). Stable for the duration of a transaction —
 * use for auction window checks, soft-close extension, and bid `acceptedAt` timestamps.
 */
export async function getTransactionServerNow(tx: Prisma.TransactionClient): Promise<Date> {
  const rows = await tx.$queryRaw<Array<{ now: Date }>>`SELECT now() AS now`;
  const row = rows[0];
  if (!row?.now) throw new Error("SERVER_NOW_UNAVAILABLE");
  return row.now instanceof Date ? row.now : new Date(row.now);
}

/** Postgres `now()` outside a transaction (preflight checks only — commit path must use transaction time). */
export async function getServerNow(db: PrismaClient): Promise<Date> {
  const rows = await db.$queryRaw<Array<{ now: Date }>>`SELECT now() AS now`;
  const row = rows[0];
  if (!row?.now) throw new Error("SERVER_NOW_UNAVAILABLE");
  return row.now instanceof Date ? row.now : new Date(row.now);
}
