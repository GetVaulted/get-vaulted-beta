import { NextResponse } from "next/server";
import { ensureSellerStripeExpressAccountId } from "@/lib/seller-stripe-connect";
import { requireUserIdFromSupabaseBearer } from "@/lib/require-supabase-bearer";
import { prisma } from "@/lib/prisma";
import { getStripe, isStripeConfigured } from "@/lib/stripe";

export const runtime = "nodejs";

function publicSiteBaseForStripeConnectRedirects(): string {
  /** Prefer when `NEXT_PUBLIC_SITE_URL` is the marketing apex but Next.js + `/api` live on beta. */
  const explicit = process.env.STRIPE_CONNECT_PUBLIC_APP_URL?.trim();
  const authUrl = process.env.NEXTAUTH_URL?.trim();
  const publicUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const raw = explicit || authUrl || publicUrl || "http://localhost:3000";
  return raw.replace(/\/$/, "");
}

/**
 * Returns a Stripe-hosted Account Link for Connect onboarding (Express).
 * POST /api/stripe/connect/create-onboarding-link
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

  const base = publicSiteBaseForStripeConnectRedirects();
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${base}/mobile/stripe-connect-return?refresh=1`,
    return_url: `${base}/mobile/stripe-connect-return`,
    type: "account_onboarding",
  });

  if (!link.url) {
    return NextResponse.json({ error: "Stripe did not return an onboarding URL." }, { status: 500 });
  }

  return NextResponse.json({ url: link.url, stripe_account_id: accountId });
}
