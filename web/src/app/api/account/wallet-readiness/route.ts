import { NextResponse } from "next/server";
import { getServerSessionSafe } from "@/lib/auth";
import { getBuyerLiveWalletReadiness } from "@/lib/buyer-live-wallet-readiness";
import { ensureBuyerShippingFromSellerShipFrom } from "@/lib/ensure-buyer-shipping-from-seller-ship-from";

export const runtime = "nodejs";

/** Buyer wallet readiness for account hub and checkout (card + shipping address). */
export async function GET() {
  const session = await getServerSessionSafe();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureBuyerShippingFromSellerShipFrom(session.user.id);
  const { paymentReady, shippingReady } = await getBuyerLiveWalletReadiness(session.user.id);
  return NextResponse.json({
    paymentReady,
    shippingReady,
    walletReady: paymentReady && shippingReady,
  });
}
