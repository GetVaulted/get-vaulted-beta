import { NextResponse } from "next/server";
import { connectFieldsFromStripeAccount } from "@/lib/stripe-connect-account-map";
import { syncStripeConnectFromEmailSibling } from "@/lib/link-stripe-account-from-email-sibling";
import {
  loadUserForStripeConnectStatus,
  persistStripeConnectSnapshot,
} from "@/lib/load-user-stripe-connect-status";
import { requireUserIdFromSupabaseBearer } from "@/lib/require-supabase-bearer";
import {
  connectStatusFromUserRow,
  parseRequirementsDue,
  buildStripeConnectStatusJson,
} from "@/lib/stripe-connect-status-response";
import { onboardingUiStatusFromPartial } from "@/lib/stripe-connect-account-map";
import { syncStripeConnectUserRowsForAccountId } from "@/lib/sync-stripe-connect-user";
import { isStripePayoutSetupSubmitted, isStripePayoutSetupSubmittedFromAccount } from "@/lib/stripe-payout-submitted";
import { getStripe, isStripeConfigured } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/stripe/connect/status — seller Connect snapshot for mobile HQ.
 */
export async function GET(request: Request) {
  try {
    const auth = await requireUserIdFromSupabaseBearer(request);
    if (auth instanceof NextResponse) return auth;

    try {
      await syncStripeConnectFromEmailSibling(auth.userId);
    } catch (syncErr) {
      console.warn("[stripe connect status] email sibling sync failed", {
        userId: auth.userId,
        error: syncErr instanceof Error ? syncErr.message : String(syncErr),
      });
    }

    let user = await loadUserForStripeConnectStatus(auth.userId);

    if (!user) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    if (!isStripeConfigured()) {
      return NextResponse.json(
        connectStatusFromUserRow(user, false),
      );
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
    let payoutSetupSubmitted = isStripePayoutSetupSubmitted({
      hasStripeAccount: Boolean(user.stripeAccountId?.trim()),
      stripeOnboardingComplete: Boolean(user.stripeOnboardingComplete),
      stripeChargesEnabled: user.stripeChargesEnabled ?? null,
      stripePayoutsEnabled: user.stripePayoutsEnabled ?? null,
      currentlyDue: requirementsSnap?.currentlyDue ?? [],
      pendingVerification: requirementsSnap?.pendingVerification ?? [],
    });

    if (user.stripeAccountId?.trim()) {
      try {
        const stripe = getStripe();
        const account = await stripe.accounts.retrieve(user.stripeAccountId);
        const currentlyDue = account.requirements?.currently_due ?? [];
        payoutSetupSubmitted = isStripePayoutSetupSubmittedFromAccount(account);
        console.info("[stripe connect status] account retrieved", {
          userId: auth.userId,
          stripeAccountId: user.stripeAccountId,
          charges_enabled: account.charges_enabled,
          payouts_enabled: account.payouts_enabled,
          details_submitted: account.details_submitted,
          currently_due: currentlyDue,
          pending_verification: account.requirements?.pending_verification ?? [],
        });
        const { data, onboardingUiStatus: liveUi } = connectFieldsFromStripeAccount(account);
        if (
          user.stripeOnboardingComplete &&
          data.stripeChargesEnabled === true &&
          data.stripePayoutsEnabled === true
        ) {
          data.stripeOnboardingComplete = true;
        }
        try {
          await persistStripeConnectSnapshot(auth.userId, data);
          await syncStripeConnectUserRowsForAccountId(user.stripeAccountId);
        } catch (syncErr) {
          console.warn("[stripe connect status] db sync failed", {
            userId: auth.userId,
            error: syncErr instanceof Error ? syncErr.message : String(syncErr),
          });
        }
        user = (await loadUserForStripeConnectStatus(auth.userId)) ?? user;
        onboardingUiStatus = liveUi;
        stripeOnboardingComplete = Boolean(data.stripeOnboardingComplete);
        chargesEnabled = (data.stripeChargesEnabled as boolean | null | undefined) ?? null;
        payoutsEnabled = (data.stripePayoutsEnabled as boolean | null | undefined) ?? null;
        requirementsSnap = parseRequirementsDue(data.stripeRequirementsDue);
        verificationStatus = (data.stripeVerificationStatus as string | null | undefined) ?? null;
      } catch (e) {
        console.warn("[stripe connect status] retrieve failed — using persisted snapshot", {
          userId: auth.userId,
          stripeAccountId: user.stripeAccountId,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return NextResponse.json(
      buildStripeConnectStatusJson({
        user,
        stripeConfigured: true,
        stripeOnboardingComplete,
        chargesEnabled,
        payoutsEnabled,
        requirementsSnap,
        verificationStatus,
        onboardingUiStatus,
        payoutSetupSubmitted,
      }),
    );
  } catch (e) {
    console.error("[stripe connect status] unhandled", e);
    const message = e instanceof Error ? e.message : String(e);
    const isDb =
      /DATABASE_URL/i.test(message) ||
      /Can't reach database|Connection|ECONNREFUSED|P1001|P1017/i.test(message);
    return NextResponse.json(
      {
        error: isDb
          ? "Database is unavailable. Check DATABASE_URL on the beta site."
          : "Could not load payout status. Try again in a moment.",
        code: isDb ? "DATABASE_UNAVAILABLE" : "STATUS_ERROR",
      },
      { status: 500 },
    );
  }
}
