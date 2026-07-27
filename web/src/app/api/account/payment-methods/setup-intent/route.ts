import { NextResponse } from "next/server";
import { resolveAccountUserId } from "@/lib/resolve-account-auth";
import { ensureStripeCustomerIdForUser } from "@/lib/stripe-customer";
import { getStripe, getStripePublishableKey, isStripeConfigured } from "@/lib/stripe";
import { isWalletVenmoEnabled } from "@/lib/payment-processor";
import { stripeSetupIntentPaymentOptions } from "@/lib/stripe-payment-method-config";

/**
 * Creates a SetupIntent so the buyer can add a card / Cash App / other wallet PM
 * to their Stripe Customer (off-session usage for live wins).
 */
export async function POST(req: Request) {
  // Buyer wallet setup — skip Connect sibling sync (extra DB work on every mobile auth).
  const auth = await resolveAccountUserId(req, { skipStripeSiblingSync: true });
  if (auth instanceof NextResponse) return auth;

  if (!isStripeConfigured()) {
    return NextResponse.json(
      { error: "Stripe is not configured. Add STRIPE_SECRET_KEY to enable saved payment methods." },
      { status: 503 },
    );
  }

  const publishableKey = getStripePublishableKey().trim();
  if (!publishableKey) {
    return NextResponse.json(
      { error: "Stripe publishable key is missing. Set NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY." },
      { status: 503 },
    );
  }

  try {
    const customerId = await ensureStripeCustomerIdForUser(auth.userId);
    const stripe = getStripe();
    let setupIntent;
    try {
      setupIntent = await stripe.setupIntents.create({
        customer: customerId,
        ...stripeSetupIntentPaymentOptions(),
        usage: "off_session",
      });
    } catch (firstErr) {
      // Dashboard may not have Cash App / Link / Amazon Pay enabled yet — still allow card + Apple Pay.
      console.warn("[setup-intent] optional wallet methods rejected; falling back to card", {
        error: firstErr instanceof Error ? firstErr.message : String(firstErr),
      });
      setupIntent = await stripe.setupIntents.create({
        customer: customerId,
        payment_method_types: ["card"],
        usage: "off_session",
      });
    }
    const clientSecret = setupIntent.client_secret;
    if (!clientSecret) {
      return NextResponse.json({ error: "Could not start card setup." }, { status: 500 });
    }
    const paymentMethodTypes = Array.isArray(setupIntent.payment_method_types)
      ? setupIntent.payment_method_types
      : ["card"];
    return NextResponse.json({
      clientSecret,
      publishableKey,
      merchantCountryCode: "US",
      applePayEnabled: paymentMethodTypes.includes("card"),
      googlePayEnabled: paymentMethodTypes.includes("card"),
      linkEnabled: paymentMethodTypes.includes("link"),
      cashAppPayEnabled: paymentMethodTypes.includes("cashapp"),
      amazonPayEnabled: paymentMethodTypes.includes("amazon_pay"),
      paypalEnabled: false,
      venmoEnabled: isWalletVenmoEnabled(),
      paymentMethodTypes,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "USER_NOT_FOUND") {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }
    console.error(e);
    return NextResponse.json({ error: "Could not start card setup. Try again later." }, { status: 500 });
  }
}
