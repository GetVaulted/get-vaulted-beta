import { NextResponse } from "next/server";
import {
  countOrdersReadyForAdminBankPayout,
  listOrdersReadyForAdminBankPayout,
} from "@/lib/admin/orders-ready-for-bank-payout";
import { healOrdersWithExistingBankPayoutIds } from "@/lib/admin/reconcile-stripe-bank-payouts";
import { requireAdmin } from "@/lib/require-admin";

export const runtime = "nodejs";

/** GET — Stripe-rail orders ready for admin to push bank payout. */
export async function GET(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  // Heal split-writes (`po_` on order but still *_payout_ready) before listing.
  await healOrdersWithExistingBankPayoutIds().catch((e) => {
    console.warn("[admin/payouts/ready] heal failed", e);
  });

  const url = new URL(req.url);
  const limitRaw = Number(url.searchParams.get("limit") ?? "100");
  const limit = Number.isFinite(limitRaw) ? Math.floor(limitRaw) : 100;

  const [count, orders] = await Promise.all([
    countOrdersReadyForAdminBankPayout(),
    listOrdersReadyForAdminBankPayout(limit),
  ]);

  return NextResponse.json({ count, orders });
}
