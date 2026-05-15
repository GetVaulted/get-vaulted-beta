import type { PrismaClient } from "@/generated/prisma/client";
import { isDevTempNoDatabaseMode } from "@/lib/dev-temp-no-db";

/**
 * Username collision check. Registration always stores `normalizeUsernameForStorage`
 * (lowercase ASCII), so an exact `findUnique` matches the unique index and avoids
 * `$queryRaw` / `ILIKE` paths that can misbehave with some pooled Postgres setups.
 */
export async function isUsernameTakenCaseInsensitive(
  db: PrismaClient,
  normalizedUsername: string,
): Promise<boolean> {
  if (isDevTempNoDatabaseMode()) {
    return false;
  }
  const row = await db.user.findUnique({
    where: { username: normalizedUsername },
    select: { id: true },
  });
  return row !== null;
}
