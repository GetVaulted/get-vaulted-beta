import type { User as SupabaseAuthUser } from "@supabase/supabase-js";
import { isEmailVerificationRequiredForSignIn } from "@/lib/unified-auth";
import { prisma } from "@/lib/prisma";

export function emailVerifiedAtFromSupabaseUser(supabaseUser: SupabaseAuthUser): Date | null {
  if (supabaseUser.email_confirmed_at) return new Date(supabaseUser.email_confirmed_at);
  if (!isEmailVerificationRequiredForSignIn()) return new Date();
  return null;
}

/** Align Prisma `emailVerified` when Supabase Auth has already accepted the credentials. */
export async function syncPrismaEmailVerifiedFromSupabase(
  prismaUserId: string,
  supabaseUser: SupabaseAuthUser,
): Promise<Date | null> {
  const verifiedAt = emailVerifiedAtFromSupabaseUser(supabaseUser);
  if (!verifiedAt) return null;

  const updated = await prisma.user.updateMany({
    where: { id: prismaUserId, emailVerified: null },
    data: { emailVerified: verifiedAt },
  });

  if (updated.count > 0) {
    void import("@/lib/giveaway/entries")
      .then(({ onUserEmailVerifiedForGiveaways }) => onUserEmailVerifiedForGiveaways(prismaUserId))
      .catch((e) => console.warn("[sync-email-verified] giveaway entry hook failed", e));
  }

  return verifiedAt;
}
