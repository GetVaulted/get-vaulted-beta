import { NextResponse } from "next/server";
import { resolveAccountUserId } from "@/lib/resolve-account-auth";
import { ensureStripeCustomerIdForUser } from "@/lib/stripe-customer";
import { getStripe, getStripePublishableKey, isStripeConfigured } from "@/lib/stripe";

/**
 * Creates a SetupIntent so the buyer can add a card to their Stripe Customer (off-session usage for wins).
 */
export async function POST(req: Request) {
  const auth = await resolveAccountUserId(req);
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
    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      // PaymentSheet-friendly: card + Apple Pay (when configured). No redirect wallets on mobile.
      automatic_payment_methods: {
        enabled: true,
        allow_redirects: "never",
      },
      usage: "off_session",
    });
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
