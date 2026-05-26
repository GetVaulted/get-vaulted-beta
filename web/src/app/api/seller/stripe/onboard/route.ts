import { NextResponse } from "next/server";
import { logStripeOnboarding, resolveSellerStripeUserId } from "@/lib/resolve-seller-stripe-user";
import { ensureSellerStripeExpressAccountId } from "@/lib/seller-stripe-connect";
import { stripeConnectPublicAppBase } from "@/lib/stripe-connect-public-app-url";
import { stripeRouteErrorResponse } from "@/lib/stripe-route-errors";
import { prisma } from "@/lib/prisma";
import { getStripe, isStripeConfigured } from "@/lib/stripe";

export const runtime = "nodejs";

/**
 * Creates or refreshes a Stripe Connect Express onboarding link for the signed-in seller.
 */
export async function POST(request: Request) {
  try {
    if (!isStripeConfigured()) {
      return NextResponse.json(
        { error: "Stripe is not configured (set STRIPE_SECRET_KEY in .env for test mode)." },
        { status: 503 },
      );
    }

    const resolved = await resolveSellerStripeUserId(request);
    if (resolved instanceof NextResponse) return resolved;
    const { userId, authSource } = resolved;

    const before = await prisma.user.findUnique({
      where: { id: userId },
      select: { stripeAccountId: true },
    });
    const existingStripeAccountId = before?.stripeAccountId ?? null;

    logStripeOnboarding("onboard_start", {
      userId,
      authSource,
      existingStripeAccountId,
    });

    const stripe = getStripe();
    let accountId: string;
    try {
      accountId = await ensureSellerStripeExpressAccountId(prisma, stripe, userId);
    } catch (e) {
      const { status, body } = stripeRouteErrorResponse("seller stripe onboard account", e);
      return NextResponse.json(body, { status });
    }

    const base = stripeConnectPublicAppBase(request);
    const returnUrl = `${base}/account/seller/setup?stripe_return=1`;
    const refreshUrl = `${base}/account/seller/setup?stripe_refresh=1`;

    logStripeOnboarding("creating_account_link", {
      userId,
      stripeAccountId: accountId,
      accountAction: existingStripeAccountId ? "reused" : "created",
      returnUrl,
      refreshUrl,
    });

    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: "account_onboarding",
    });

    if (!link.url) {
      return NextResponse.json({ error: "Stripe did not return an onboarding URL." }, { status: 500 });
    }

    logStripeOnboarding("account_link_created", {
      userId,
      stripeAccountId: accountId,
      url: link.url,
    });

    return NextResponse.json({ url: link.url });
  } catch (e) {
    const { status, body } = stripeRouteErrorResponse("seller stripe onboard", e);
    return NextResponse.json(body, { status });
  }
}
