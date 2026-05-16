import { NextResponse } from "next/server";
import { connectFieldsFromStripeAccount, onboardingUiStatusFromPartial } from "@/lib/stripe-connect-account-map";
import { requireUserIdFromSupabaseBearer } from "@/lib/require-supabase-bearer";
import { prisma } from "@/lib/prisma";
import { getStripe, isStripeConfigured } from "@/lib/stripe";

export const runtime = "nodejs";

type RequirementsSnapshot = {
  currentlyDue: string[];
  pendingVerification: string[];
  eventuallyDue: string[];
  disabledReason: string | null;
};

function parseRequirementsDue(raw: unknown): RequirementsSnapshot | null {
  if (raw == null || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  return {
    currentlyDue: Array.isArray(o.currentlyDue) ? (o.currentlyDue as string[]) : [],
    pendingVerification: Array.isArray(o.pendingVerification) ? (o.pendingVerification as string[]) : [],
    eventuallyDue: Array.isArray(o.eventuallyDue) ? (o.eventuallyDue as string[]) : [],
    disabledReason: typeof o.disabledReason === "string" ? o.disabledReason : null,
  };
}

/**
 * GET /api/stripe/connect/status — seller Connect snapshot for mobile HQ.
 */
export async function GET(request: Request) {
  const auth = await requireUserIdFromSupabaseBearer(request);
  if (auth instanceof NextResponse) return auth;

  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: {
      stripeAccountId: true,
      stripeOnboardingComplete: true,
      stripeChargesEnabled: true,
      stripePayoutsEnabled: true,
      stripeRequirementsDue: true,
      stripeVerificationStatus: true,
    },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  if (!isStripeConfigured()) {
    return NextResponse.json({
      stripeConfigured: false,
      stripe_account_id: user.stripeAccountId ?? null,
      stripe_onboarding_complete: Boolean(user.stripeOnboardingComplete),
      stripe_charges_enabled: user.stripeChargesEnabled ?? null,
      stripe_payouts_enabled: user.stripePayoutsEnabled ?? null,
      stripe_requirements_due: parseRequirementsDue(user.stripeRequirementsDue),
      stripe_verification_status: user.stripeVerificationStatus ?? null,
      onboarding_ui_status: user.stripeAccountId ? "in_progress" : "not_started",
      can_publish_active_listings: true,
      can_host_live_sales: true,
      payouts_ready: false,
      message_onboarding: null,
      message_payouts: "Stripe is not configured in this environment.",
    });
  }

  let onboardingUiStatus = onboardingUiStatusFromPartial({
    hasAccountId: Boolean(user.stripeAccountId?.trim()),
    stripeOnboardingComplete: Boolean(user.stripeOnboardingComplete),
    stripeChargesEnabled: user.stripeChargesEnabled ?? null,
    stripePayoutsEnabled: user.stripePayoutsEnabled ?? null,
    requirementsDue: parseRequirementsDue(user.stripeRequirementsDue),
  });

  let stripeOnboardingComplete = Boolean(user.stripeOnboardingComplete);
  let chargesEnabled = user.stripeChargesEnabled ?? null;
  let payoutsEnabled = user.stripePayoutsEnabled ?? null;
  let requirementsSnap = parseRequirementsDue(user.stripeRequirementsDue);
  let verificationStatus = user.stripeVerificationStatus ?? null;
  let payoutSetupSubmitted = false;

  if (user.stripeAccountId) {
    try {
      const stripe = getStripe();
      const account = await stripe.accounts.retrieve(user.stripeAccountId);
      const currentlyDue = account.requirements?.currently_due ?? [];
      payoutSetupSubmitted =
        Boolean(account.details_submitted) && currentlyDue.length === 0;
      const { data, onboardingUiStatus: liveUi } = connectFieldsFromStripeAccount(account);
      await prisma.user.update({
        where: { id: auth.userId },
        data,
      });
      onboardingUiStatus = liveUi;
      stripeOnboardingComplete = Boolean(data.stripeOnboardingComplete);
      chargesEnabled = (data.stripeChargesEnabled as boolean | null | undefined) ?? null;
      payoutsEnabled = (data.stripePayoutsEnabled as boolean | null | undefined) ?? null;
      requirementsSnap = parseRequirementsDue(data.stripeRequirementsDue);
      verificationStatus = (data.stripeVerificationStatus as string | null | undefined) ?? null;
    } catch (e) {
      console.warn("[stripe connect status] retrieve failed", {
        userId: auth.userId,
        stripeAccountId: user.stripeAccountId,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const canSell =
    Boolean(user.stripeAccountId?.trim()) &&
    stripeOnboardingComplete &&
    chargesEnabled === true &&
    payoutsEnabled === true &&
    onboardingUiStatus !== "restricted";

  return NextResponse.json({
    stripeConfigured: true,
    stripe_account_id: user.stripeAccountId ?? null,
    stripe_onboarding_complete: stripeOnboardingComplete,
    stripe_charges_enabled: chargesEnabled,
    stripe_payouts_enabled: payoutsEnabled,
    stripe_requirements_due: requirementsSnap,
    stripe_verification_status: verificationStatus,
    onboarding_ui_status: onboardingUiStatus,
    can_publish_active_listings: canSell,
    can_host_live_sales: canSell,
    payouts_ready: payoutsEnabled === true,
    message_onboarding: canSell
      ? null
      : "Stripe needs more information before payouts can be enabled.",
    message_payouts: canSell
      ? "Payout setup complete. You can publish listings and host live sales."
      : payoutSetupSubmitted
        ? "Stripe received your payout details. Refresh status in Seller HQ — Ready or Complete usually appears within a few minutes."
        : payoutsEnabled === true
          ? "Payouts are ready — finish any remaining Stripe steps if prompted."
          : null,
    payout_setup_complete: canSell,
    payout_setup_submitted: payoutSetupSubmitted,
  });
}
