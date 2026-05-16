import { NextResponse } from "next/server";
import { getServerSessionSafe } from "@/lib/auth";
import { requireUserIdFromSupabaseBearer } from "@/lib/require-supabase-bearer";
import { prisma } from "@/lib/prisma";
import { getStripe, isStripeConfigured } from "@/lib/stripe";

export const runtime = "nodejs";

async function resolveSellerUserId(request: Request): Promise<{ userId: string } | NextResponse> {
  if (request.headers.get("authorization")?.startsWith("Bearer ")) {
    return requireUserIdFromSupabaseBearer(request);
  }
  const session = await getServerSessionSafe();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return { userId: session.user.id };
}

/**
 * POST /api/stripe/connect/create-dashboard-link
 * Stripe Express Dashboard — balances, payouts, and withdrawals.
 */
export async function POST(request: Request) {
  const auth = await resolveSellerUserId(request);
  if (auth instanceof NextResponse) return auth;

  if (!isStripeConfigured()) {
    return NextResponse.json(
      { error: "Stripe is not configured (set STRIPE_SECRET_KEY)." },
      { status: 503 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { stripeAccountId: true },
  });
  if (!user?.stripeAccountId?.trim()) {
    return NextResponse.json(
      {
        error: "Complete payout setup before withdrawing.",
        code: "NO_STRIPE_ACCOUNT",
      },
      { status: 400 },
    );
  }

  const stripe = getStripe();
  const login = await stripe.accounts.createLoginLink(user.stripeAccountId);
  if (!login.url) {
    return NextResponse.json({ error: "Stripe did not return a dashboard URL." }, { status: 500 });
  }

  return NextResponse.json({ url: login.url });
}
