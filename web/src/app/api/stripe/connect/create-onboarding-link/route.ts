import { NextResponse } from "next/server";
import { ensureSellerStripeExpressAccountId } from "@/lib/seller-stripe-connect";
import { requireUserIdFromSupabaseBearer } from "@/lib/require-supabase-bearer";
import { stripeConnectMobileReturnUrls } from "@/lib/stripe-connect-public-app-url";
import { stripeRouteErrorResponse } from "@/lib/stripe-route-errors";
import { prisma } from "@/lib/prisma";
import { getStripe, isStripeConfigured } from "@/lib/stripe";

export const runtime = "nodejs";

/**
 * Returns a Stripe-hosted Account Link for Connect onboarding (Express).
 * POST /api/stripe/connect/create-onboarding-link
 */
export async function POST(request: Request) {
  try {
    const auth = await requireUserIdFromSupabaseBearer(request);
    if (auth instanceof NextResponse) return auth;

    if (!isStripeConfigured()) {
      return NextResponse.json(
        { error: "Stripe is not configured (set STRIPE_SECRET_KEY)." },
        { status: 503 },
      );
    }

    const stripe = getStripe();
    let accountId: string;
    try {
      accountId = await ensureSellerStripeExpressAccountId(prisma, stripe, auth.userId);
    } catch (e) {
      const { status, body } = stripeRouteErrorResponse("stripe connect create-onboarding-link account", e);
      return NextResponse.json(body, { status });
    }

    const { returnUrl, refreshUrl } = stripeConnectMobileReturnUrls(request);
    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: "account_onboarding",
    });

    if (!link.url) {
      return NextResponse.json({ error: "Stripe did not return an onboarding URL." }, { status: 500 });
    }

    return NextResponse.json({ url: link.url, stripe_account_id: accountId });
  } catch (e) {
    const { status, body } = stripeRouteErrorResponse("stripe connect create-onboarding-link", e);
    return NextResponse.json(body, { status });
  }
}
