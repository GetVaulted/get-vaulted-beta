import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { reconcileStripeBankPayoutsForReadySellers } from "@/lib/admin/reconcile-stripe-bank-payouts";

export const runtime = "nodejs";

/**
 * POST — Sync admin bank-payout queue with Stripe Connect reality.
 * Heals orders that already have `po_` / zero-net, and matches Connect payouts by metadata.orderId.
 */
export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  let sellerId: string | undefined;
  try {
    const body = (await req.json().catch(() => ({}))) as { sellerId?: string };
    if (typeof body.sellerId === "string" && body.sellerId.trim()) {
      sellerId = body.sellerId.trim();
    }
  } catch {
    /* empty body ok */
  }

  const result = await reconcileStripeBankPayoutsForReadySellers({ sellerId });
  return NextResponse.json({ ok: true, ...result });
}
