import { prisma } from "@/lib/prisma";
import { stripeConnectSnapshotScore } from "@/lib/stripe-connect-snapshot-score";

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

  const userAcct = user.stripeAccountId?.trim() ?? null;
  if (userAcct && donorId !== userAcct) {
    console.warn("[syncStripeConnectFromEmailSibling] skip — different Connect accounts on same email", {
      userId,
      userAcct,
      donorAcct: donorId,
    });
    return userAcct;
  }

  const mergedDonorView = { ...user, ...donor, stripeAccountId: donorId };
  if (stripeConnectSnapshotScore(user) >= stripeConnectSnapshotScore(mergedDonorView)) {
    return userAcct ?? null;
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
