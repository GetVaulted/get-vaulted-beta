import { NextResponse } from "next/server";
import { getServerSessionSafe } from "@/lib/auth";
import { getBuyerLiveWalletReadiness } from "@/lib/buyer-live-wallet-readiness";

export const runtime = "nodejs";

/** Buyer wallet readiness for account hub and checkout (card + shipping address). */
export async function GET() {
  const session = await getServerSessionSafe();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { paymentReady, shippingReady } = await getBuyerLiveWalletReadiness(session.user.id);
  return NextResponse.json({
    paymentReady,
    shippingReady,
    walletReady: paymentReady && shippingReady,
  });
}
