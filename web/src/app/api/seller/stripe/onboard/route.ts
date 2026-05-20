import { NextResponse } from "next/server";
import { getServerSessionSafe } from "@/lib/auth";
import { ensureSellerStripeExpressAccountId } from "@/lib/seller-stripe-connect";
import { stripeConnectPublicAppBase } from "@/lib/stripe-connect-public-app-url";
import { stripeRouteErrorResponse } from "@/lib/stripe-route-errors";
import { prisma } from "@/lib/prisma";
import { getStripe, isStripeConfigured } from "@/lib/stripe";

export const runtime = "nodejs";

/**
 * Creates or refreshes a Stripe Connect Express onboarding link for the signed-in seller.
 * TODO: Before production, switch Stripe Dashboard + keys to live mode and use HTTPS return URLs only.
 */
export async function POST(request: Request) {
  try {
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

    const stripe = getStripe();
    let accountId: string;
    try {
      accountId = await ensureSellerStripeExpressAccountId(prisma, stripe, session.user.id);
    } catch (e) {
      const { status, body } = stripeRouteErrorResponse("seller stripe onboard account", e);
      return NextResponse.json(body, { status });
    }

    const base = stripeConnectPublicAppBase(request);
    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${base}/account/seller?stripe_refresh=1`,
      return_url: `${base}/account/seller?stripe_return=1`,
      type: "account_onboarding",
    });

    if (!link.url) {
      return NextResponse.json({ error: "Stripe did not return an onboarding URL." }, { status: 500 });
    }

    return NextResponse.json({ url: link.url });
  } catch (e) {
    const { status, body } = stripeRouteErrorResponse("seller stripe onboard", e);
    return NextResponse.json(body, { status });
  }
}
