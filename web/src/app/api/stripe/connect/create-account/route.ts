import { NextResponse } from "next/server";
import { ensureSellerStripeExpressAccountId } from "@/lib/seller-stripe-connect";
import { requireUserIdFromSupabaseBearer } from "@/lib/require-supabase-bearer";
import { prisma } from "@/lib/prisma";
import { getStripe, isStripeConfigured } from "@/lib/stripe";

export const runtime = "nodejs";

/**
 * Creates or returns the seller's Stripe Connect Express account id (no redirect URL).
 * POST /api/stripe/connect/create-account — Authorization: Bearer <Supabase access token>
 */
export async function POST(request: Request) {
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
    if (e instanceof Error && e.message === "USER_NOT_FOUND") {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }
    throw e;
  }

  return NextResponse.json({ stripe_account_id: accountId });
}
