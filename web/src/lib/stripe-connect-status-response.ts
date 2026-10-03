import type { StripeConnectOnboardingUiStatus } from "@/lib/stripe-connect-account-map";
import { onboardingUiStatusFromPartial } from "@/lib/stripe-connect-account-map";
import type { StripeConnectStatusUserRow } from "@/lib/load-user-stripe-connect-status";
import { isStripePayoutSetupSubmitted } from "@/lib/stripe-payout-submitted";

type RequirementsSnapshot = {
  currentlyDue: string[];
  pendingVerification: string[];
  eventuallyDue: string[];
  disabledReason: string | null;
} | null;

export function parseRequirementsDue(raw: unknown): RequirementsSnapshot {
  if (raw == null || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  return {
    currentlyDue: Array.isArray(o.currentlyDue) ? (o.currentlyDue as string[]) : [],
    pendingVerification: Array.isArray(o.pendingVerification) ? (o.pendingVerification as string[]) : [],
    eventuallyDue: Array.isArray(o.eventuallyDue) ? (o.eventuallyDue as string[]) : [],
    disabledReason: typeof o.disabledReason === "string" ? o.disabledReason : null,
  };
}

/** HQ / publish gates — honors persisted onboarding flag when Stripe snapshot columns are stale. */
export function sellerCanSellFromConnectSnapshot(args: {
  stripeAccountId: string | null;
  stripeOnboardingComplete: boolean;
  stripeChargesEnabled: boolean | null;
  stripePayoutsEnabled: boolean | null;
  onboardingUiStatus: StripeConnectOnboardingUiStatus;
}): boolean {
  if (!args.stripeAccountId?.trim()) return false;
  if (args.onboardingUiStatus === "restricted") return false;
  if (args.stripeOnboardingComplete) return true;
  return args.stripeChargesEnabled === true && args.stripePayoutsEnabled === true;
}

export function buildStripeConnectStatusJson(args: {
  user: StripeConnectStatusUserRow;
  stripeConfigured: boolean;
  stripeOnboardingComplete: boolean;
  chargesEnabled: boolean | null;
  payoutsEnabled: boolean | null;
  requirementsSnap: RequirementsSnapshot;
  verificationStatus: string | null;
  onboardingUiStatus: StripeConnectOnboardingUiStatus;
  payoutSetupSubmitted: boolean;
}) {
  const { user } = args;
  const canSell = sellerCanSellFromConnectSnapshot({
    stripeAccountId: user.stripeAccountId,
    stripeOnboardingComplete: args.stripeOnboardingComplete,
    stripeChargesEnabled: args.chargesEnabled,
    stripePayoutsEnabled: args.payoutsEnabled,
    onboardingUiStatus: args.onboardingUiStatus,
  });

  return {
    stripeConfigured: args.stripeConfigured,
    stripe_account_id: user.stripeAccountId ?? null,
    stripe_onboarding_complete: args.stripeOnboardingComplete,
    stripe_charges_enabled: args.chargesEnabled,
    stripe_payouts_enabled: args.payoutsEnabled,
    stripe_requirements_due: args.requirementsSnap,
    stripe_verification_status: args.verificationStatus,
    onboarding_ui_status: args.onboardingUiStatus,
    can_publish_active_listings: canSell,
    can_host_live_sales: canSell,
    payouts_ready: args.payoutsEnabled === true || (canSell && args.stripeOnboardingComplete),
    message_onboarding: canSell
      ? null
      : "Stripe needs more information before payouts can be enabled.",
    message_payouts: canSell
      ? "Payout setup complete. You can publish listings and host live sales."
      : args.payoutSetupSubmitted
        ? "Stripe received your payout details. Refresh status in Seller HQ — Ready or Complete usually appears within a few minutes."
        : args.payoutsEnabled === true
          ? "Payouts are ready — finish any remaining Stripe steps if prompted."
          : null,
    payout_setup_complete: canSell,
    payout_setup_submitted: args.payoutSetupSubmitted,
  };
}

export function connectStatusFromUserRow(
  user: StripeConnectStatusUserRow,
  stripeConfigured: boolean,
): ReturnType<typeof buildStripeConnectStatusJson> {
  const requirementsSnap = parseRequirementsDue(user.stripeRequirementsDue);
  const onboardingUiStatus = onboardingUiStatusFromPartial({
    hasAccountId: Boolean(user.stripeAccountId?.trim()),
    stripeOnboardingComplete: Boolean(user.stripeOnboardingComplete),
    stripeChargesEnabled: user.stripeChargesEnabled ?? null,
    stripePayoutsEnabled: user.stripePayoutsEnabled ?? null,
    requirementsDue: requirementsSnap,
  });
  const payoutSetupSubmitted = isStripePayoutSetupSubmitted({
    hasStripeAccount: Boolean(user.stripeAccountId?.trim()),
    stripeOnboardingComplete: Boolean(user.stripeOnboardingComplete),
    stripeChargesEnabled: user.stripeChargesEnabled ?? null,
    stripePayoutsEnabled: user.stripePayoutsEnabled ?? null,
    currentlyDue: requirementsSnap?.currentlyDue ?? [],
    pendingVerification: requirementsSnap?.pendingVerification ?? [],
  });

  return buildStripeConnectStatusJson({
    user,
    stripeConfigured,
    stripeOnboardingComplete: Boolean(user.stripeOnboardingComplete),
    chargesEnabled: user.stripeChargesEnabled ?? null,
    payoutsEnabled: user.stripePayoutsEnabled ?? null,
    requirementsSnap,
    verificationStatus: user.stripeVerificationStatus ?? null,
    onboardingUiStatus,
    payoutSetupSubmitted,
  });
}
