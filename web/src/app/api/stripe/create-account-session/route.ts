import { NextResponse } from "next/server";
import { authOptions, getServerSessionSafe } from "@/lib/auth";
import { ensureSellerStripeExpressAccountId } from "@/lib/seller-stripe-connect";
import { prisma } from "@/lib/prisma";
import { getStripe, isStripeConfigured } from "@/lib/stripe";

export const runtime = "nodejs";

/**
 * Creates a Stripe Connect AccountSession for embedded onboarding (Connect.js).
 * @see https://stripe.com/docs/connect/get-started-connect-embedded-components
 */
export async function POST() {
  const session = await getServerSessionSafe();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isStripeConfigured()) {
    return NextResponse.json(
      { error: "Stripe is not configured (set STRIPE_SECRET_KEY in .env for test mode)." },
      { status: 503 },
    );
  }

  try {
    const stripe = getStripe();
    const account = await ensureSellerStripeExpressAccountId(prisma, stripe, session.user.id);

    const accountSession = await stripe.accountSessions.create({
      account,
      components: {
        account_onboarding: {
          enabled: true,
        },
      },
    });

    if (!accountSession.client_secret) {
      return NextResponse.json({ error: "Stripe did not return a client secret." }, { status: 500 });
    }

    return NextResponse.json({ clientSecret: accountSession.client_secret });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "USER_NOT_FOUND") {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }
    console.error("[create-account-session]", e);
    return NextResponse.json({ error: msg || "Could not create account session." }, { status: 500 });
  }
}
