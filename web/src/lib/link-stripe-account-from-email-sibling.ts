import { prisma } from "@/lib/prisma";

function normalizeEmail(email: string | undefined | null): string | null {
  const e = email?.trim().toLowerCase();
  return e ? e : null;
}

/**
 * If this user has no Connect account but another row with the same email does,
 * copy `stripeAccountId` so status/onboarding APIs see the finished onboarding.
 */
export async function linkStripeAccountFromEmailSiblingIfMissing(user: {
  id: string;
  email: string | null;
  stripeAccountId: string | null;
}): Promise<string | null> {
  if (user.stripeAccountId?.trim()) return user.stripeAccountId.trim();

  const email = normalizeEmail(user.email);
  if (!email) return null;

  const sibling = await prisma.user.findFirst({
    where: {
      email: { equals: email, mode: "insensitive" },
      id: { not: user.id },
      NOT: { stripeAccountId: null },
    },
    select: { stripeAccountId: true },
    orderBy: { updatedAt: "desc" },
  });

  const donorId = sibling?.stripeAccountId?.trim();
  if (!donorId) return null;

  await prisma.user.update({
    where: { id: user.id },
    data: { stripeAccountId: donorId },
  });

  return donorId;
}
