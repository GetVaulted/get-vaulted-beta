import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import {
  markSellerReadyOrdersAlreadyPaid,
  reconcileStripeBankPayoutsForReadySellers,
} from "@/lib/admin/reconcile-stripe-bank-payouts";

export const runtime = "nodejs";

/**
 * POST — Sync admin bank-payout queue with Stripe Connect reality.
 * Heals `po_` / zero-net / bulk markers, matches Connect payouts by metadata.orderId,
 * and detects Dashboard bulk payouts that emptied Connect and cover the ready net.
 *
 * Body:
 * - `{ sellerId? }` — sync (optional seller filter)
 * - `{ action: "mark_seller_already_paid", sellerId, reason?, processorTransferId? }`
 */
export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    sellerId?: string;
    reason?: string;
    processorTransferId?: string;
  };

  if (body.action === "mark_seller_already_paid") {
    const sellerId = typeof body.sellerId === "string" ? body.sellerId.trim() : "";
    if (!sellerId) {
      return NextResponse.json({ error: "sellerId required" }, { status: 400 });
    }
    const reason =
      typeof body.reason === "string" && body.reason.trim()
        ? body.reason.trim()
        : "Already paid — Dashboard bulk bank payout";
    const marked = await markSellerReadyOrdersAlreadyPaid({
      sellerId,
      adminId: gate.userId,
      reason,
      processorTransferId:
        typeof body.processorTransferId === "string" ? body.processorTransferId : null,
    });
    if (!marked.ok) {
      return NextResponse.json({ error: marked.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true, ...marked });
  }

  const sellerId =
    typeof body.sellerId === "string" && body.sellerId.trim() ? body.sellerId.trim() : undefined;

  const result = await reconcileStripeBankPayoutsForReadySellers({ sellerId });
  return NextResponse.json({ ok: true, ...result });
}
