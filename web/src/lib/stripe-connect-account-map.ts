import type Stripe from "stripe";
import type { Prisma } from "@/generated/prisma/client";

export type StripeConnectOnboardingUiStatus =
  | "not_started"
  | "in_progress"
  | "action_required"
  | "verified"
  | "restricted";

/**
 * Maps a Stripe Connect Account to persisted `User` fields + UI status for mobile / HQ.
 * Never call from the client — server and webhooks only.
 */
export function connectFieldsFromStripeAccount(account: Stripe.Account): {
  data: Prisma.UserUpdateInput;
  onboardingUiStatus: StripeConnectOnboardingUiStatus;
} {
  const currentlyDue = account.requirements?.currently_due ?? [];
  const pendingVerification = account.requirements?.pending_verification ?? [];
  const eventuallyDue = account.requirements?.eventually_due ?? [];
  const disabledReason = account.requirements?.disabled_reason ?? null;

  const chargesEnabled = Boolean(account.charges_enabled);
  const payoutsEnabled = Boolean(account.payouts_enabled);
  const detailsSubmitted = Boolean(account.details_submitted);

  const requirementsClear =
    detailsSubmitted && currentlyDue.length === 0 && pendingVerification.length === 0;

  const stripeOnboardingComplete = requirementsClear;

  const individualStatus = account.individual?.verification?.status ?? null;
  /** `Company.Verification` in Stripe's TS defs is document-only; API may still expose `status` at runtime for some accounts. */
  const companyVerification = account.company?.verification as { status?: string } | null | undefined;
  const companyStatus = typeof companyVerification?.status === "string" ? companyVerification.status : null;
  const verificationLabel =
    typeof individualStatus === "string"
      ? individualStatus
      : typeof companyStatus === "string"
        ? companyStatus
        : null;

  const data: Prisma.UserUpdateInput = {
    stripeChargesEnabled: chargesEnabled,
    stripePayoutsEnabled: payoutsEnabled,
    stripeOnboardingComplete,
    stripeRequirementsDue: {
      currentlyDue,
      pendingVerification,
      eventuallyDue,
      disabledReason,
    } as unknown as Prisma.InputJsonValue,
    stripeVerificationStatus: verificationLabel,
  };

  let onboardingUiStatus: StripeConnectOnboardingUiStatus;
  if (disabledReason) {
    onboardingUiStatus = "restricted";
  } else if (stripeOnboardingComplete && chargesEnabled && payoutsEnabled) {
    onboardingUiStatus = "verified";
  } else if (detailsSubmitted && (currentlyDue.length > 0 || pendingVerification.length > 0)) {
    onboardingUiStatus = "action_required";
  } else if (!detailsSubmitted) {
    onboardingUiStatus = "in_progress";
  } else {
    onboardingUiStatus = "action_required";
  }

  return { data, onboardingUiStatus };
}

export function onboardingUiStatusFromPartial(args: {
  hasAccountId: boolean;
  stripeOnboardingComplete: boolean;
  stripeChargesEnabled: boolean | null;
  stripePayoutsEnabled: boolean | null;
  requirementsDue: {
    currentlyDue?: string[];
    pendingVerification?: string[];
    eventuallyDue?: string[];
    disabledReason?: string | null;
  } | null;
}): StripeConnectOnboardingUiStatus {
  if (!args.hasAccountId) return "not_started";

  const cr = args.requirementsDue;
  const disabledReason = cr?.disabledReason ?? null;
  if (disabledReason) return "restricted";

  const cu = cr?.currentlyDue ?? [];
  const pv = cr?.pendingVerification ?? [];
  const charges = args.stripeChargesEnabled === true;
  const payouts = args.stripePayoutsEnabled === true;

  if (args.stripeOnboardingComplete && charges && payouts) return "verified";
  if (cu.length > 0 || pv.length > 0) return "action_required";
  if (!args.stripeOnboardingComplete) return "in_progress";
  return "action_required";
}
