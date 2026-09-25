import { NextResponse } from "next/server";
import { healOrdersWithExistingBankPayoutIds } from "@/lib/admin/reconcile-stripe-bank-payouts";
import { listSellersReadyForAdminBankPayout } from "@/lib/admin/sellers-ready-for-bank-payout";
import { requireAdmin } from "@/lib/require-admin";

export const runtime = "nodejs";

/** GET — Seller-centric Stripe bank-payout queue (owed vs Connect available). */
export async function GET(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  await healOrdersWithExistingBankPayoutIds().catch((e) => {
    console.warn("[admin/payouts/ready] heal failed", e);
  });

  const url = new URL(req.url);
  const limitRaw = Number(url.searchParams.get("limit") ?? "500");
  const limit = Number.isFinite(limitRaw) ? Math.floor(limitRaw) : 500;

  const payload = await listSellersReadyForAdminBankPayout(limit);
  return NextResponse.json(payload);
}
