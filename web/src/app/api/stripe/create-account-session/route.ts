import { NextResponse } from "next/server";
import { logStripeOnboarding, resolveSellerStripeUserId } from "@/lib/resolve-seller-stripe-user";
import { ensureSellerStripeExpressAccountId } from "@/lib/seller-stripe-connect";
import { prisma } from "@/lib/prisma";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { stripeRouteErrorResponse } from "@/lib/stripe-route-errors";

export const runtime = "nodejs";

/**
 * Creates a Stripe Connect AccountSession for embedded onboarding (Connect.js).
 * @see https://stripe.com/docs/connect/get-started-connect-embedded-components
 */
export async function POST(request: Request) {
  if (!isStripeConfigured()) {
    return NextResponse.json(
      { error: "Stripe is not configured (set STRIPE_SECRET_KEY in .env for test mode)." },
      { status: 503 },
    );
  }

  try {
    const resolved = await resolveSellerStripeUserId(request);
    if (resolved instanceof NextResponse) return resolved;
    const { userId, authSource } = resolved;

    const before = await prisma.user.findUnique({
      where: { id: userId },
      select: { stripeAccountId: true },
    });

    logStripeOnboarding("embed_session_start", {
      userId,
      authSource,
      existingStripeAccountId: before?.stripeAccountId ?? null,
    });

    const stripe = getStripe();
    let accountId: string;
    try {
      accountId = await ensureSellerStripeExpressAccountId(prisma, stripe, userId);
    } catch (e) {
      const { status, body } = stripeRouteErrorResponse("create-account-session account", e);
      return NextResponse.json(body, { status });
    }

    const accountSession = await stripe.accountSessions.create({
      account: accountId,
      components: {
        account_onboarding: {
          enabled: true,
        },
      },
    });

    if (!accountSession.client_secret) {
      return NextResponse.json({ error: "Stripe did not return a client secret." }, { status: 500 });
    }

    logStripeOnboarding("embed_session_created", {
      userId,
      stripeAccountId: accountId,
      accountAction: before?.stripeAccountId ? "reused" : "created",
    });

    return NextResponse.json({ clientSecret: accountSession.client_secret });
  } catch (e) {
    const { status, body } = stripeRouteErrorResponse("create-account-session", e);
    return NextResponse.json(body, { status });
  }
}
