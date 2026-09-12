import { NextResponse } from "next/server";
import { resolveAccountUserId } from "@/lib/resolve-account-auth";
import { getBuyerLiveWalletReadiness } from "@/lib/buyer-live-wallet-readiness";
import { ensureBuyerShippingFromSellerShipFrom } from "@/lib/ensure-buyer-shipping-from-seller-ship-from";

export const runtime = "nodejs";

/** Buyer wallet readiness for account hub and checkout (card + shipping address). */
export async function GET(req: Request) {
  const auth = await resolveAccountUserId(req, { skipStripeSiblingSync: true });
  if (auth instanceof NextResponse) return auth;
  const userId = auth.userId;

  await ensureBuyerShippingFromSellerShipFrom(userId);
  const { paymentReady, shippingReady } = await getBuyerLiveWalletReadiness(userId);
  return NextResponse.json({
    paymentReady,
    shippingReady,
    walletReady: paymentReady && shippingReady,
  });
}
