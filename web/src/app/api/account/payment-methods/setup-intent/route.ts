import { NextResponse } from "next/server";
import { authOptions, getServerSessionSafe } from "@/lib/auth";
import { ensureStripeCustomerIdForUser } from "@/lib/stripe-customer";
import { getStripe, getStripePublishableKey, isStripeConfigured } from "@/lib/stripe";

/**
 * Creates a SetupIntent so the buyer can add a card to their Stripe Customer (off-session usage for wins).
 */
export async function POST() {
  const session = await getServerSessionSafe();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
    const customerId = await ensureStripeCustomerIdForUser(session.user.id);
    const stripe = getStripe();
    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ["card"],
      usage: "off_session",
    });
    const clientSecret = setupIntent.client_secret;
    if (!clientSecret) {
      return NextResponse.json({ error: "Could not start card setup." }, { status: 500 });
    }
    return NextResponse.json({
      clientSecret,
      publishableKey,
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
