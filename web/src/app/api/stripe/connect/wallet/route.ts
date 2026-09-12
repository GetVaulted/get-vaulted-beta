import { NextResponse } from "next/server";
import { syncStripeConnectFromEmailSibling } from "@/lib/link-stripe-account-from-email-sibling";
import { requireUserIdFromSupabaseBearer } from "@/lib/require-supabase-bearer";
import { getServerSessionSafe } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildSellerWalletSummary } from "@/lib/stripe-connect-wallet-summary";
import { getStripe, isStripeConfigured } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
 * GET /api/stripe/connect/wallet — Connect balance, payout history, and recent
 * balance movements for Seller HQ Revenue.
 */
export async function GET(request: Request) {
  try {
    const auth = await resolveSellerUserId(request);
    if (auth instanceof NextResponse) return auth;

    if (!isStripeConfigured()) {
      return NextResponse.json(
        buildSellerWalletSummary({
          stripeConfigured: false,
          hasStripeAccount: false,
          balance: null,
          payouts: [],
          balanceTransactions: [],
          payoutSchedule: null,
        }),
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: { email: true, stripeAccountId: true },
    });
    if (!user) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    try {
      await syncStripeConnectFromEmailSibling(auth.userId);
    } catch {
      /* non-fatal */
    }

    const linked = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: { stripeAccountId: true },
    });
    if (!linked) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    const accountId = linked.stripeAccountId?.trim();
    if (!accountId) {
      return NextResponse.json(
        buildSellerWalletSummary({
          stripeConfigured: true,
          hasStripeAccount: false,
          balance: null,
          payouts: [],
          balanceTransactions: [],
          payoutSchedule: null,
        }),
      );
    }

    const stripe = getStripe();
    const [balance, payoutsList, activityList, account] = await Promise.all([
      stripe.balance.retrieve({}, { stripeAccount: accountId }),
      stripe.payouts.list({ limit: 15 }, { stripeAccount: accountId }),
      stripe.balanceTransactions.list({ limit: 20 }, { stripeAccount: accountId }),
      stripe.accounts.retrieve(accountId),
    ]);

    const summary = buildSellerWalletSummary({
      stripeConfigured: true,
      hasStripeAccount: true,
      balance,
      payouts: payoutsList.data,
      balanceTransactions: activityList.data,
      payoutSchedule: account.settings?.payouts?.schedule ?? null,
    });

    return NextResponse.json(summary);
  } catch (e) {
    console.error("[stripe connect wallet]", e);
    return NextResponse.json(
      { error: "Could not load wallet balances. Try again in a moment." },
      { status: 500 },
    );
  }
}
