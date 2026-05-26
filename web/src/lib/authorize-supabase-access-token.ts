import { ensurePrismaUserForSupabaseAuth } from "@/lib/ensure-prisma-user-from-supabase-auth";
import { getSupabaseAuthServerClient, type CredentialsSessionUser } from "@/lib/authenticate-supabase-credentials";
import { isAccountDeleted } from "@/lib/account-deletion";
import { prisma } from "@/lib/prisma";
import { syncPrismaEmailVerifiedFromSupabase } from "@/lib/sync-prisma-email-verified";

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
  if (!prismaUserId) return null;

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
  if (!user || user.suspendedAt || isAccountDeleted(user)) return null;

  if (!user.emailVerified) {
    const synced = await syncPrismaEmailVerifiedFromSupabase(user.id, data.user);
    if (!synced) return null;
  }

  return {
    id: user.id,
    email: user.email,
    name: user.username,
    role: user.role === "admin" ? "admin" : "user",
  };
}
