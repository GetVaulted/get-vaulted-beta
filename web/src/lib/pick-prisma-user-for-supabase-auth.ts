/** Minimal row shape for resolving which Prisma `User.id` mobile APIs should use. */
export type PrismaUserStripePick = {
  id: string;
  stripeAccountId: string | null;
};

function hasStripeAccountId(row: PrismaUserStripePick | null | undefined): boolean {
  return Boolean(row?.stripeAccountId?.trim());
}

/**
 * When Supabase auth id and email map to different Prisma users, prefer the row that
 * already has Connect onboarding (common when web NextAuth created the seller first).
 */
export function pickPrismaUserIdForSupabaseSession(args: {
  supabaseUserId: string;
  byId: PrismaUserStripePick | null;
  byEmail: PrismaUserStripePick | null;
}): string | null {
  const { supabaseUserId, byId, byEmail } = args;

  if (byId && byEmail && byId.id !== byEmail.id) {
    const idHasStripe = hasStripeAccountId(byId);
    const emailHasStripe = hasStripeAccountId(byEmail);
    if (emailHasStripe && !idHasStripe) return byEmail.id;
    if (idHasStripe && !emailHasStripe) return byId.id;
    return byId.id;
  }

  if (byId) return byId.id;
  if (byEmail) return byEmail.id;
  return null;
}
