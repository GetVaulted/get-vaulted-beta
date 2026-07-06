import { createClient } from "@supabase/supabase-js";
import { isAccountDeleted } from "@/lib/account-deletion";
import { ensurePrismaUserForSupabaseAuth } from "@/lib/ensure-prisma-user-from-supabase-auth";
import { prisma } from "@/lib/prisma";
import { syncPrismaEmailVerifiedFromSupabase } from "@/lib/sync-prisma-email-verified";

export type CredentialsSessionUser = {
  id: string;
  email: string;
  name: string;
  role: "user" | "admin";
};

/** Server-side Supabase Auth client (anon key). Same project as mobile `signInWithPassword`. */
export function getSupabaseAuthServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? process.env.SUPABASE_URL?.trim() ?? "";
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? process.env.SUPABASE_ANON_KEY?.trim() ?? "";
  if (!url || !anonKey) return null;
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Validates email/password against Supabase Auth, then resolves a Prisma `User` row
 * (creating or linking via `ensurePrismaUserForSupabaseAuth`). Used by NextAuth credentials
 * so mobile-created accounts can sign in on beta.shopgetvaulted.com.
 */
export async function authorizeCredentialsViaSupabase(
  email: string,
  password: string,
): Promise<CredentialsSessionUser | null> {
  const supabase = getSupabaseAuthServerClient();
  if (!supabase) return null;

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  if (error || !data.user) return null;

  let prismaUserId: string | null;
  try {
    prismaUserId = await ensurePrismaUserForSupabaseAuth(data.user);
  } catch (e) {
    console.error("[authorizeCredentialsViaSupabase] ensurePrismaUser failed", e);
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
  if (!user || user.suspendedAt) return null;
  // Deletion revokes the Supabase Auth user best-effort (see account-deletion.ts); if that
  // revoke ever fails (transient error, misconfigured service role), the Supabase password
  // check above would otherwise still succeed for a deleted account. Re-check here too, not
  // just on the Bearer path (require-supabase-bearer.ts), so web credentials sign-in can't
  // resurrect a deleted account.
  if (isAccountDeleted(user)) return null;

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
