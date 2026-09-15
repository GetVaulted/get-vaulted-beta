import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { backfillOrderPaidAtBatch } from "@/lib/admin/backfill-order-paid-at";

export const runtime = "nodejs";

/**
 * POST — Process one bounded batch of the Order.paidAt historical backfill (financial
 * reconciliation audit, bug #1). Call repeatedly until `mayHaveMore` is false. Read-only against
 * Stripe (only fetches PaymentIntent/Charge data, never mutates anything on Stripe's side) and
 * only ever writes rows where `paidAt IS NULL` — safe to re-run.
 *
 * Body: `{ limit? }` — orders per batch, default 200, max 500.
 */
export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const body = (await req.json().catch(() => ({}))) as { limit?: number };
  const limit = typeof body.limit === "number" ? body.limit : undefined;

  const result = await backfillOrderPaidAtBatch({ limit });
  return NextResponse.json({ ok: true, ...result });
}
