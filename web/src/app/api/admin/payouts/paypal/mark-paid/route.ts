import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { markSellerPayPalOrdersAlreadyPaid } from "@/lib/admin/paypal-mark-paid";

export const runtime = "nodejs";

/**
 * POST — Record that a seller's PayPal-rail balance was already paid off-platform (e.g. the admin
 * sent it directly), without calling the PayPal Payouts API again. See paypal-mark-paid.ts.
 */
export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const body = (await req.json().catch(() => ({}))) as { sellerId?: string; reason?: string };
  const sellerId = typeof body.sellerId === "string" ? body.sellerId.trim() : "";
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";

  if (!sellerId) {
    return NextResponse.json({ error: "sellerId is required." }, { status: 400 });
  }
  if (!reason) {
    return NextResponse.json({ error: "Reason is required." }, { status: 400 });
  }

  const result = await markSellerPayPalOrdersAlreadyPaid({ sellerId, adminId: gate.userId, reason });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json(result);
}
