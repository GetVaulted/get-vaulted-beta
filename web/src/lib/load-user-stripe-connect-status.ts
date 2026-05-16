import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

/** Full row shape for Connect status (requires `20260115183000_user_stripe_connect_snapshot`). */
export const stripeConnectStatusUserSelect = {
  email: true,
  stripeAccountId: true,
  stripeOnboardingComplete: true,
  stripeChargesEnabled: true,
  stripePayoutsEnabled: true,
  stripeRequirementsDue: true,
  stripeVerificationStatus: true,
} as const;

export type StripeConnectStatusUserRow = {
  email: string;
  stripeAccountId: string | null;
  stripeOnboardingComplete: boolean;
  stripeChargesEnabled: boolean | null;
  stripePayoutsEnabled: boolean | null;
  stripeRequirementsDue: unknown;
  stripeVerificationStatus: string | null;
};

const legacySelect = {
  email: true,
  stripeAccountId: true,
  stripeOnboardingComplete: true,
} as const;

function isMissingColumnError(e: unknown): boolean {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    return e.code === "P2022";
  }
  const msg = e instanceof Error ? e.message : String(e);
  return /column.*does not exist|Unknown column/i.test(msg);
}

function toStatusRow(
  row: {
    email: string;
    stripeAccountId: string | null;
    stripeOnboardingComplete: boolean;
    stripeChargesEnabled?: boolean | null;
    stripePayoutsEnabled?: boolean | null;
    stripeRequirementsDue?: unknown;
    stripeVerificationStatus?: string | null;
  },
): StripeConnectStatusUserRow {
  return {
    email: row.email,
    stripeAccountId: row.stripeAccountId,
    stripeOnboardingComplete: row.stripeOnboardingComplete,
    stripeChargesEnabled: row.stripeChargesEnabled ?? null,
    stripePayoutsEnabled: row.stripePayoutsEnabled ?? null,
    stripeRequirementsDue: row.stripeRequirementsDue ?? null,
    stripeVerificationStatus: row.stripeVerificationStatus ?? null,
  };
}

/** Loads seller row for Connect status; falls back when snapshot columns are not migrated yet. */
export async function loadUserForStripeConnectStatus(
  userId: string,
): Promise<StripeConnectStatusUserRow | null> {
  try {
    const row = await prisma.user.findUnique({
      where: { id: userId },
      select: stripeConnectStatusUserSelect,
    });
    return row ? toStatusRow(row) : null;
  } catch (e) {
    if (!isMissingColumnError(e)) throw e;
    console.warn("[stripe connect status] snapshot columns missing; using legacy User select", {
      userId,
    });
    const row = await prisma.user.findUnique({
      where: { id: userId },
      select: legacySelect,
    });
    return row ? toStatusRow(row) : null;
  }
}

export async function persistStripeConnectSnapshot(
  userId: string,
  data: Prisma.UserUpdateInput,
): Promise<void> {
  try {
    await prisma.user.update({ where: { id: userId }, data });
    return;
  } catch (e) {
    if (!isMissingColumnError(e)) throw e;
  }
  await prisma.user.update({
    where: { id: userId },
    data: {
      stripeOnboardingComplete: data.stripeOnboardingComplete,
    },
  });
}
