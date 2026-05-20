import { prisma } from "@/lib/prisma";

function normalizeEmail(email: string | undefined | null): string | null {
  const e = email?.trim().toLowerCase();
  return e ? e : null;
}

const stripeSnapshotSelect = {
  stripeAccountId: true,
  stripeOnboardingComplete: true,
  stripeChargesEnabled: true,
  stripePayoutsEnabled: true,
  stripeRequirementsDue: true,
  stripeVerificationStatus: true,
} as const;

function snapshotScore(row: {
  stripeAccountId: string | null;
  stripeOnboardingComplete: boolean;
  stripeChargesEnabled: boolean | null;
  stripePayoutsEnabled: boolean | null;
}): number {
  let score = 0;
  if (row.stripeAccountId?.trim()) score += 1;
  if (row.stripeOnboardingComplete) score += 4;
  if (row.stripeChargesEnabled === true) score += 2;
  if (row.stripePayoutsEnabled === true) score += 2;
  return score;
}

/**
 * When Supabase auth maps to a User row missing Connect data, copy the fullest snapshot
 * from another row with the same email (common: web NextAuth user vs mobile Supabase id).
 */
export async function syncStripeConnectFromEmailSibling(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, ...stripeSnapshotSelect },
  });
  if (!user) return null;

  const email = normalizeEmail(user.email);
  if (!email) return user.stripeAccountId?.trim() ?? null;

  const donor = await prisma.user.findFirst({
    where: {
      email: { equals: email, mode: "insensitive" },
      id: { not: userId },
      NOT: { stripeAccountId: null },
    },
    select: stripeSnapshotSelect,
    orderBy: [{ stripeOnboardingComplete: "desc" }, { updatedAt: "desc" }],
  });

  const donorId = donor?.stripeAccountId?.trim();
  if (!donor || !donorId) return user.stripeAccountId?.trim() ?? null;

  if (snapshotScore(user) >= snapshotScore({ ...user, ...donor, stripeAccountId: donorId })) {
    return user.stripeAccountId?.trim() ?? null;
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      stripeAccountId: donor.stripeAccountId,
      stripeOnboardingComplete: donor.stripeOnboardingComplete,
      stripeChargesEnabled: donor.stripeChargesEnabled,
      stripePayoutsEnabled: donor.stripePayoutsEnabled,
      stripeRequirementsDue: donor.stripeRequirementsDue ?? undefined,
      stripeVerificationStatus: donor.stripeVerificationStatus,
    },
  });

  return donorId;
}

/** @deprecated Use syncStripeConnectFromEmailSibling */
export async function linkStripeAccountFromEmailSiblingIfMissing(user: {
  id: string;
  email: string | null;
  stripeAccountId: string | null;
}): Promise<string | null> {
  if (user.stripeAccountId?.trim()) return user.stripeAccountId.trim();
  return syncStripeConnectFromEmailSibling(user.id);
}
