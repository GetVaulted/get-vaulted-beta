import { NextResponse } from "next/server";
import { listPayPalPayoutQueue } from "@/lib/admin/paypal-payout-queue";
import { requireAdmin } from "@/lib/require-admin";

export const runtime = "nodejs";

/** GET — every paid order on the PayPal seller-payout rail, grouped by seller. */
export async function GET(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const limitRaw = Number(url.searchParams.get("limit") ?? "300");
  const limit = Number.isFinite(limitRaw) ? Math.floor(limitRaw) : 300;

  const payload = await listPayPalPayoutQueue(limit);
  return NextResponse.json(payload);
}
