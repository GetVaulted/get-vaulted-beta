import { prisma } from "@/lib/prisma";
import { usesUnifiedSupabaseAuth } from "@/lib/unified-auth";

const userSelect = {
  id: true,
  email: true,
  username: true,
  role: true,
  suspendedAt: true,
  accountDeletedAt: true,
  emailVerified: true,
  passwordHash: true,
} as const;

export type AuthResolvedUser = {
  id: string;
  email: string;
  username: string;
  role: "user" | "admin";
  suspendedAt: Date | null;
  emailVerified: Date | null;
  passwordHash: string | null;
};

export type AuthResolveUserFailure = "not_found" | "suspended" | "deleted" | "unverified_credentials";

/**
 * Maps JWT/session identifiers to the current `User` row.
 * If `sub` is missing from the DB (e.g. DB reset / new cuid) but `email` matches, returns the row found by email
 * so callers can rebind `token.sub` / `session.user.id` without creating duplicates.
 */
export async function resolveAuthUserForToken(args: {
  tokenSub: string | undefined;
  tokenEmail: string | undefined;
}): Promise<
  | { ok: true; user: AuthResolvedUser; reboundedFromEmail: boolean }
  | { ok: false; reason: AuthResolveUserFailure }
> {
  const emailNorm = args.tokenEmail?.trim().toLowerCase() ?? "";

  let row = args.tokenSub
    ? await prisma.user.findUnique({
        where: { id: args.tokenSub },
        select: userSelect,
      })
    : null;

  let reboundedFromEmail = false;
  if (!row && emailNorm) {
    row = await prisma.user.findUnique({
      where: { email: emailNorm },
      select: userSelect,
    });
    if (row) reboundedFromEmail = true;
  }

  if (!row) return { ok: false, reason: "not_found" };
  if (row.accountDeletedAt) return { ok: false, reason: "deleted" };
  if (row.suspendedAt) return { ok: false, reason: "suspended" };
  if (row.passwordHash && !row.emailVerified && !usesUnifiedSupabaseAuth()) {
    return { ok: false, reason: "unverified_credentials" };
  }

  const role: "user" | "admin" = row.role === "admin" ? "admin" : "user";
  return {
    ok: true,
    user: {
      id: row.id,
      email: row.email,
      username: row.username,
      role,
      suspendedAt: row.suspendedAt,
      emailVerified: row.emailVerified,
      passwordHash: row.passwordHash,
    },
    reboundedFromEmail,
  };
}

/** Forces NextAuth to treat the session as signed out on the next request. */
export function expiredJwtToken<T extends Record<string, unknown>>(token: T): T & { exp: number } {
  return { ...token, exp: Math.floor(Date.now() / 1000) - 120 };
}
