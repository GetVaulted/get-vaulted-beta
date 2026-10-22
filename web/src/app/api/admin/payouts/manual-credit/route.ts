import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { addManualPayoutCredit } from "@/lib/seller-manual-payout-credit";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { normalizeUsernameForStorage } from "@/lib/username-policy";

export const runtime = "nodejs";

const MAX_CREDIT_USD = 50_000;

/** GET — recent manual payout credits (newest first), with who they belong to and what is still unspent. */
export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const rows = await prisma.sellerManualPayoutCredit.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      amountCents: true,
      usedCents: true,
      note: true,
      stripeTransferId: true,
      createdAt: true,
      seller: { select: { username: true } },
    },
  });
  return NextResponse.json({
    credits: rows.map((r) => ({
      id: r.id,
      username: r.seller.username,
      amountUsd: r.amountCents / 100,
      remainingUsd: Math.max(0, r.amountCents - r.usedCents) / 100,
      note: r.note,
      stripeTransferId: r.stripeTransferId,
      createdAt: r.createdAt.toISOString(),
    })),
  });
}

/**
 * POST — record money you already put into a seller's Stripe balance so the seller can pay it out themselves.
 * Body: `{ username | sellerId, amountUsd, note?, stripeTransferId? }`
 * This does NOT move money. When `stripeTransferId` is given it must be a transfer to this seller's Connect
 * account for at least this amount, and one transfer can only be credited once.
 */
export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  let body: { username?: string; sellerId?: string; amountUsd?: number; note?: string; stripeTransferId?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const amountUsd = typeof body.amountUsd === "number" ? body.amountUsd : Number.NaN;
  const amountCents = Math.round(amountUsd * 100);
  if (!Number.isFinite(amountUsd) || amountCents < 1 || amountUsd > MAX_CREDIT_USD) {
    return NextResponse.json({ error: `Enter an amount between $0.01 and $${MAX_CREDIT_USD}.` }, { status: 400 });
  }

  const username = normalizeUsernameForStorage(
    typeof body.username === "string" ? body.username.replace(/^@+/, "") : "",
  );
  const sellerId = typeof body.sellerId === "string" ? body.sellerId.trim() : "";
  if (!sellerId && username.length < 3) {
    return NextResponse.json({ error: "Enter the seller's username." }, { status: 400 });
  }

  const seller = await prisma.user.findFirst({
    where: sellerId ? { id: sellerId } : { username: { equals: username, mode: "insensitive" } },
    select: { id: true, username: true, stripeAccountId: true, stripeOnboardingComplete: true },
  });
  if (!seller) return NextResponse.json({ error: "No seller found with that username." }, { status: 404 });
  const accountId = seller.stripeAccountId?.trim();
  if (!accountId || !seller.stripeOnboardingComplete) {
    return NextResponse.json({ error: "That seller has no finished Stripe payout account." }, { status: 409 });
  }

  const transferId = typeof body.stripeTransferId === "string" ? body.stripeTransferId.trim() : "";
  if (transferId) {
    if (!/^tr_[A-Za-z0-9]+$/.test(transferId)) {
      return NextResponse.json({ error: "That doesn't look like a Stripe transfer id (tr_...)." }, { status: 400 });
    }
    if (!isStripeConfigured()) {
      return NextResponse.json({ error: "Stripe isn't configured, so the transfer can't be checked." }, { status: 503 });
    }
    try {
      const t = await getStripe().transfers.retrieve(transferId);
      const destination = typeof t.destination === "string" ? t.destination : t.destination?.id;
      if (destination !== accountId) {
        return NextResponse.json({ error: "That transfer went to a different Stripe account." }, { status: 409 });
      }
      if (t.amount - (t.amount_reversed ?? 0) < amountCents) {
        return NextResponse.json({ error: "That transfer is smaller than the credit amount." }, { status: 409 });
      }
    } catch {
      return NextResponse.json({ error: "Stripe couldn't find that transfer." }, { status: 404 });
    }
    const dupe = await prisma.sellerManualPayoutCredit.findUnique({
      where: { stripeTransferId: transferId },
      select: { id: true },
    });
    if (dupe) return NextResponse.json({ error: "That transfer was already credited." }, { status: 409 });
  }

  try {
    const row = await addManualPayoutCredit({
      sellerId: seller.id,
      amountCents,
      note: typeof body.note === "string" ? body.note : null,
      adminId: gate.userId,
      stripeTransferId: transferId || null,
    });
    return NextResponse.json({ ok: true, id: row.id, username: seller.username, amountUsd: amountCents / 100 });
  } catch (e) {
    console.error("[admin/payouts/manual-credit]", e);
    return NextResponse.json({ error: "Could not save the credit." }, { status: 500 });
  }
}
