import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { getSellerSelfPayoutSummary } from "@/lib/seller-self-payout";
import { getStripe, isStripeConfigured } from "@/lib/stripe";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_SELLERS = 250;
const ACTIVE_WINDOW_DAYS = 120;

function usd(buckets: Array<{ amount: number; currency: string }> | undefined): number {
  return (buckets ?? []).filter((b) => b.currency === "usd").reduce((s, b) => s + b.amount, 0) / 100;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]!);
      }
    }),
  );
  return out;
}

/**
 * GET — read-only. Live Stripe Connect balance for each active seller, next to what that seller's
 * "Initiate Payout" button would actually send. `gapUsd` is money sitting in Stripe "available" that the
 * seller cannot pay out yet (e.g. a manual transfer with no credit recorded). Moves no money.
 * Optional `?usernames=a,b,c` limits the check to those sellers.
 */
export async function GET(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;
  if (!isStripeConfigured()) return NextResponse.json({ error: "Stripe isn't configured." }, { status: 503 });

  const url = new URL(req.url);
  const names = (url.searchParams.get("usernames") ?? "")
    .split(",")
    .map((n) => n.trim().replace(/^@+/, "").toLowerCase())
    .filter(Boolean);

  const since = new Date(Date.now() - ACTIVE_WINDOW_DAYS * 86_400_000);
  const sellers = await prisma.user.findMany({
    where: {
      stripeAccountId: { not: null },
      stripeOnboardingComplete: true,
      ...(names.length
        ? { username: { in: names, mode: "insensitive" as const } }
        : { sales: { some: { createdAt: { gte: since } } } }),
    },
    select: { id: true, username: true, stripeAccountId: true },
    take: MAX_SELLERS,
  });

  const stripe = getStripe();
  const balances = await mapLimit(sellers, 8, async (s) => {
    try {
      const b = await stripe.balance.retrieve({ stripeAccount: s.stripeAccountId! });
      return { ok: true as const, availableUsd: usd(b.available), pendingUsd: usd(b.pending) };
    } catch {
      return { ok: false as const };
    }
  });

  const withMoney = sellers
    .map((s, i) => ({ s, b: balances[i]! }))
    .filter((x) => x.b.ok && x.b.availableUsd >= 1);

  const rows = await mapLimit(withMoney, 4, async ({ s, b }) => {
    const available = b.ok ? b.availableUsd : 0;
    const pending = b.ok ? b.pendingUsd : 0;
    let payableUsd: number | null = null;
    let creditUsd = 0;
    let state: string | null = null;
    try {
      const sum = await getSellerSelfPayoutSummary(s.id);
      payableUsd = sum.payableUsd;
      creditUsd = sum.creditUsd;
      state = sum.state;
    } catch {
      /* leave unknown */
    }
    return {
      username: s.username,
      availableUsd: available,
      pendingUsd: pending,
      payableUsd,
      creditUsd,
      state,
      gapUsd: payableUsd == null ? null : Math.max(0, Math.round((available - payableUsd) * 100) / 100),
    };
  });

  rows.sort((a, b) => (b.gapUsd ?? -1) - (a.gapUsd ?? -1));
  return NextResponse.json({
    checkedSellers: sellers.length,
    failedBalanceLookups: balances.filter((b) => !b.ok).length,
    rows,
  });
}
