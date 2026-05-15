import { NextResponse } from "next/server";
import { authOptions, getServerSessionSafe } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getStripe, isStripeConfigured } from "@/lib/stripe";

/**
 * Lightweight polling endpoint for Stripe onboarding completion state.
 * Use this while embedded onboarding modal is open to avoid reloading the whole seller dashboard payload.
 */
export async function GET() {
  const session = await getServerSessionSafe();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { stripeOnboardingComplete: true, stripeAccountId: true },
  });
  if (!user) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const includeDebug = process.env.NODE_ENV !== "production";
  let debugStripeOnboardingBlockedBy: string[] | undefined;
  let debugStripeRequirements:
    | {
        currentlyDue: string[];
        pendingVerification: string[];
        eventuallyDue: string[];
        disabledReason?: string | null;
      }
    | undefined;

  let liveOnboardingComplete = Boolean(user.stripeOnboardingComplete);

  // Debug aid: inspect live Stripe account state to identify blockers and sync onboarding completion.
  if (isStripeConfigured() && user.stripeAccountId) {
    try {
      const stripe = getStripe();
      const account = await stripe.accounts.retrieve(user.stripeAccountId);
      const currentlyDue = account.requirements?.currently_due ?? [];
      const pendingVerification = account.requirements?.pending_verification ?? [];
      const eventuallyDue = account.requirements?.eventually_due ?? [];
      const disabledReason = account.requirements?.disabled_reason ?? null;
      liveOnboardingComplete =
        Boolean(account.details_submitted) && currentlyDue.length === 0 && pendingVerification.length === 0;
      const onboardingBlockedBy =
        !liveOnboardingComplete && currentlyDue.length > 0
          ? currentlyDue
          : !liveOnboardingComplete && pendingVerification.length > 0
            ? pendingVerification
            : !liveOnboardingComplete && !account.charges_enabled
              ? ["charges_enabled=false"]
              : !liveOnboardingComplete && !account.payouts_enabled
                ? ["payouts_enabled=false"]
                : !liveOnboardingComplete && !account.details_submitted
                  ? ["details_submitted=false"]
                  : [];
      if (liveOnboardingComplete !== Boolean(user.stripeOnboardingComplete)) {
        await prisma.user.update({
          where: { id: session.user.id },
          data: { stripeOnboardingComplete: liveOnboardingComplete },
        });
      }
      if (includeDebug) {
        debugStripeOnboardingBlockedBy = onboardingBlockedBy;
        debugStripeRequirements = {
          currentlyDue,
          pendingVerification,
          eventuallyDue,
          disabledReason,
        };
      }
      console.info("[stripe onboarding debug]", {
        sellerId: session.user.id,
        stripeAccountId: user.stripeAccountId,
        charges_enabled: account.charges_enabled,
        payouts_enabled: account.payouts_enabled,
        details_submitted: account.details_submitted,
        requirements: account.requirements,
        onboardingBlockedBy,
      });
    } catch (e) {
      console.warn("[stripe onboarding debug] retrieve failed", {
        sellerId: session.user.id,
        stripeAccountId: user.stripeAccountId,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return NextResponse.json({
    stripeOnboardingComplete: liveOnboardingComplete,
    stripeAccountId: user.stripeAccountId ?? null,
    ...(includeDebug ? { debugStripeOnboardingBlockedBy, debugStripeRequirements } : {}),
  });
}

