import { NextResponse } from "next/server";
import { logStripeOnboarding } from "@/lib/resolve-seller-stripe-user";
import { ensureSellerStripeExpressAccountId } from "@/lib/seller-stripe-connect";
import { requireUserIdFromSupabaseBearer } from "@/lib/require-supabase-bearer";
import { stripeRouteErrorResponse } from "@/lib/stripe-route-errors";
import { prisma } from "@/lib/prisma";
import { getStripe, isStripeConfigured } from "@/lib/stripe";

export const runtime = "nodejs";

/**
 * Creates or returns the seller's Stripe Connect Express account id (no redirect URL).
 * POST /api/stripe/connect/create-account — Authorization: Bearer <Supabase access token>
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

    const before = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: { stripeAccountId: true },
    });

    logStripeOnboarding("create_account_start", {
      userId: auth.userId,
      existingStripeAccountId: before?.stripeAccountId ?? null,
    });

    const stripe = getStripe();
    let accountId: string;
    try {
      accountId = await ensureSellerStripeExpressAccountId(prisma, stripe, auth.userId);
    } catch (e) {
      const { status, body } = stripeRouteErrorResponse("stripe connect create-account", e);
      return NextResponse.json(body, { status });
    }

    logStripeOnboarding("create_account_done", {
      userId: auth.userId,
      stripeAccountId: accountId,
      accountAction: before?.stripeAccountId ? "reused" : "created",
    });

    return NextResponse.json({ stripe_account_id: accountId });
  } catch (e) {
    const { status, body } = stripeRouteErrorResponse("stripe connect create-account", e);
    return NextResponse.json(body, { status });
  }
}
