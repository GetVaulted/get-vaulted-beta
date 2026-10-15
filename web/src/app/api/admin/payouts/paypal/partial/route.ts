import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import {
  recordSellerPayPalPartialPayment,
  voidSellerPayPalPartialPayment,
} from "@/lib/admin/paypal-partial-payments";

export const runtime = "nodejs";

/** POST — record a partial payment already sent to a seller (never calls PayPal). */
export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const body = (await req.json().catch(() => ({}))) as { sellerId?: string; amountUsd?: number | string; note?: string };
  const sellerId = typeof body.sellerId === "string" ? body.sellerId.trim() : "";
  const amountUsd = typeof body.amountUsd === "number" ? body.amountUsd : Number(body.amountUsd);
  if (!sellerId) return NextResponse.json({ error: "sellerId is required." }, { status: 400 });

  const result = await recordSellerPayPalPartialPayment({
    sellerId,
    adminId: gate.userId,
    amountUsd,
    note: typeof body.note === "string" ? body.note : null,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}

/** DELETE — undo a mistaken partial payment entry. */
export async function DELETE(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const body = (await req.json().catch(() => ({}))) as { id?: string };
  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id) return NextResponse.json({ error: "id is required." }, { status: 400 });

  const result = await voidSellerPayPalPartialPayment({ id });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
