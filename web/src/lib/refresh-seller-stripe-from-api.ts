import type Stripe from "stripe";
import { connectFieldsFromStripeAccount } from "@/lib/stripe-connect-account-map";
import { persistStripeConnectSnapshot } from "@/lib/load-user-stripe-connect-status";
import { logStripeOnboarding } from "@/lib/resolve-seller-stripe-user";
import { syncStripeConnectUserRowsForAccountId } from "@/lib/sync-stripe-connect-user";
import { getStripe } from "@/lib/stripe";

/** Pull latest Connect Account from Stripe and persist snapshot to Postgres (Stripe = source of truth). */
export async function refreshSellerStripeFromStripeApi(args: {
  userId: string;
  stripeAccountId: string;
}): Promise<{ account: Stripe.Account; synced: boolean }> {
  const stripe = getStripe();
  const account = await stripe.accounts.retrieve(args.stripeAccountId);
  const { data } = connectFieldsFromStripeAccount(account);

  logStripeOnboarding("stripe_account_retrieved", {
    userId: args.userId,
    stripeAccountId: args.stripeAccountId,
    charges_enabled: account.charges_enabled,
    payouts_enabled: account.payouts_enabled,
    details_submitted: account.details_submitted,
    currently_due: account.requirements?.currently_due ?? [],
    pending_verification: account.requirements?.pending_verification ?? [],
  });

  try {
    await persistStripeConnectSnapshot(args.userId, data);
    await syncStripeConnectUserRowsForAccountId(args.stripeAccountId);
    logStripeOnboarding("db_snapshot_updated", {
      userId: args.userId,
      stripeAccountId: args.stripeAccountId,
      stripeOnboardingComplete: data.stripeOnboardingComplete,
    });
    return { account, synced: true };
  } catch (e) {
    console.error("[refreshSellerStripeFromStripeApi] db update failed", {
      userId: args.userId,
      stripeAccountId: args.stripeAccountId,
      error: e instanceof Error ? e.message : String(e),
    });
    return { account, synced: false };
  }
}
