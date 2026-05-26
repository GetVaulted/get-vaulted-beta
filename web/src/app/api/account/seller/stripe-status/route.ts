import { NextResponse } from "next/server";
import { loadUserForStripeConnectStatus } from "@/lib/load-user-stripe-connect-status";
import { refreshSellerStripeFromStripeApi } from "@/lib/refresh-seller-stripe-from-api";
import { logStripeOnboarding, resolveSellerStripeUserId } from "@/lib/resolve-seller-stripe-user";
import { parseRequirementsDue } from "@/lib/stripe-connect-status-response";
import { stripeRouteErrorResponse } from "@/lib/stripe-route-errors";
import { isStripeConfigured } from "@/lib/stripe";

export const dynamic = "force-dynamic";

/**
 * Poll / refresh Stripe Connect onboarding state after embedded or hosted onboarding.
 * Stripe is the source of truth — full snapshot is persisted to Postgres on each call.
 */
export async function GET(request: Request) {
  try {
    const resolved = await resolveSellerStripeUserId(request);
    if (resolved instanceof NextResponse) return resolved;
    const { userId } = resolved;

    let user = await loadUserForStripeConnectStatus(userId);
    if (!user) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    logStripeOnboarding("stripe_status_poll", {
      userId,
      existingStripeAccountId: user.stripeAccountId ?? null,
      persistedOnboardingComplete: user.stripeOnboardingComplete,
    });

    let dbSynced = false;
    let stripeOnboardingComplete = Boolean(user.stripeOnboardingComplete);
    let stripeChargesEnabled = user.stripeChargesEnabled ?? null;
    let stripePayoutsEnabled = user.stripePayoutsEnabled ?? null;

    if (isStripeConfigured() && user.stripeAccountId?.trim()) {
      try {
        const refreshed = await refreshSellerStripeFromStripeApi({
          userId,
          stripeAccountId: user.stripeAccountId,
        });
        dbSynced = refreshed.synced;
        user = (await loadUserForStripeConnectStatus(userId)) ?? user;
        stripeOnboardingComplete = Boolean(user.stripeOnboardingComplete);
        stripeChargesEnabled = user.stripeChargesEnabled ?? null;
        stripePayoutsEnabled = user.stripePayoutsEnabled ?? null;
      } catch (e) {
        const { status, body } = stripeRouteErrorResponse("account seller stripe-status", e);
        return NextResponse.json(body, { status });
      }
    }

    const includeDebug = process.env.NODE_ENV !== "production";
    const requirementsSnap = parseRequirementsDue(user.stripeRequirementsDue);

    return NextResponse.json({
      stripeOnboardingComplete,
      stripeAccountId: user.stripeAccountId ?? null,
      stripeChargesEnabled,
      stripePayoutsEnabled,
      dbSynced,
      ...(includeDebug
        ? {
            debugStripeRequirements: requirementsSnap
              ? {
                  currentlyDue: requirementsSnap.currentlyDue,
                  pendingVerification: requirementsSnap.pendingVerification,
                  eventuallyDue: requirementsSnap.eventuallyDue,
                  disabledReason: requirementsSnap.disabledReason,
                }
              : undefined,
          }
        : {}),
    });
  } catch (e) {
    const { status, body } = stripeRouteErrorResponse("account seller stripe-status", e);
    return NextResponse.json(body, { status });
  }
}
