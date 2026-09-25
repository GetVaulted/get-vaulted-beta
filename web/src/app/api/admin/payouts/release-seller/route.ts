import { NextResponse } from "next/server";
import { releaseSellerReadyBankPayouts } from "@/lib/admin/release-seller-bank-payouts";
import { requireAdmin } from "@/lib/require-admin";

export const runtime = "nodejs";

/**
 * POST — Push Connect→bank payouts for one seller (FIFO, never over Connect available).
 * Body: `{ sellerId, reason? }`
 */
export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  let body: { sellerId?: string; reason?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const sellerId = typeof body.sellerId === "string" ? body.sellerId.trim() : "";
  if (!sellerId) {
    return NextResponse.json({ error: "sellerId required" }, { status: 400 });
  }
  const reason =
    typeof body.reason === "string" && body.reason.trim()
      ? body.reason.trim()
      : "Admin seller bank payout release";

  try {
    const result = await releaseSellerReadyBankPayouts({
      sellerId,
      adminId: gate.userId,
      reason,
    });
    return NextResponse.json(result);
  } catch (e) {
    console.error("[admin/payouts/release-seller]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Release failed" },
      { status: 500 },
    );
  }
}
