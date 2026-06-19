import { ensurePrismaUserForSupabaseAuth } from "@/lib/ensure-prisma-user-from-supabase-auth";
import { getSupabaseAuthServerClient, type CredentialsSessionUser } from "@/lib/authenticate-supabase-credentials";
import { isAccountDeleted } from "@/lib/account-deletion";
import { prisma } from "@/lib/prisma";
import { syncPrismaEmailVerifiedFromSupabase } from "@/lib/sync-prisma-email-verified";
import { isEmailVerificationRequiredForSignIn } from "@/lib/unified-auth";

/** Validates a Supabase access token (OAuth or password) and returns a NextAuth user shape. */
export async function authorizeSupabaseAccessToken(
  accessToken: string | null | undefined,
): Promise<CredentialsSessionUser | null> {
  const jwt = accessToken?.trim();
  if (!jwt) return null;

  const supabase = getSupabaseAuthServerClient();
  if (!supabase) return null;

  const { data, error } = await supabase.auth.getUser(jwt);
  if (error || !data.user) return null;

  let prismaUserId: string | null;
  try {
    prismaUserId = await ensurePrismaUserForSupabaseAuth(data.user);
  } catch (e) {
    console.error("[authorizeSupabaseAccessToken] ensurePrismaUser failed", e);
    return null;
  }
  if (!prismaUserId) {
    console.warn("[authorizeSupabaseAccessToken] no Prisma user for Supabase auth user", {
      supabaseUserId: data.user.id,
      email: data.user.email ?? null,
      providers: data.user.app_metadata?.providers,
    });
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: prismaUserId },
    select: {
      id: true,
      email: true,
      username: true,
      role: true,
      suspendedAt: true,
      accountDeletedAt: true,
      emailVerified: true,
    },
  });
  if (!user || user.suspendedAt || isAccountDeleted(user)) {
    console.warn("[authorizeSupabaseAccessToken] Prisma user blocked or missing", {
      prismaUserId,
      found: Boolean(user),
    });
    return null;
  }

  if (!user.emailVerified) {
    const synced = await syncPrismaEmailVerifiedFromSupabase(user.id, data.user);
    if (!synced && isEmailVerificationRequiredForSignIn()) {
      console.warn("[authorizeSupabaseAccessToken] emailVerified sync failed", {
        userId: user.id,
        supabaseEmailConfirmed: data.user.email_confirmed_at ?? null,
      });
      return null;
    }
  }

  return {
    id: user.id,
    email: user.email,
    name: user.username,
    role: user.role === "admin" ? "admin" : "user",
  };
}
