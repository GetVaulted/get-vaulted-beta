import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { RefundRequestError, adminRetryStuckRefund } from "@/services/order-refund-request";

type RouteCtx = { params: Promise<{ id: string }> };

/**
 * Manual recovery for an `OrderRefundRequest` stuck in `refund_processing` (see
 * `executeOrderRefund`'s ambiguous Stripe-failure path) — lets an admin trigger a safe re-attempt
 * instead of requiring a raw DB fix. Gated server-side by `STUCK_REFUND_PROCESSING_MS` so it can't
 * race a refund that's still genuinely in flight.
 */
export async function POST(_req: Request, ctx: RouteCtx) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const { id } = await ctx.params;
  const requestId = id?.trim();
  if (!requestId) return NextResponse.json({ error: "id required" }, { status: 400 });

  try {
    const request = await adminRetryStuckRefund({ requestId, adminUserId: gate.userId });
    return NextResponse.json({ request });
  } catch (e) {
    if (e instanceof RefundRequestError) {
      return NextResponse.json({ error: e.code }, { status: e.status });
    }
    console.error("[admin refund-requests retry]", e);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
