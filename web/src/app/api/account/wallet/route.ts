import { NextResponse } from "next/server";
import { buildBuyerWalletSummary } from "@/lib/buyer-wallet";
import { ensureBuyerShippingFromSellerShipFrom } from "@/lib/ensure-buyer-shipping-from-seller-ship-from";
import { resolveAccountUserId } from "@/lib/resolve-account-auth";

/** Consolidated Vault Wallet summary for mobile and web account hub. */
export async function GET(req: Request) {
  const auth = await resolveAccountUserId(req);
  if (auth instanceof NextResponse) return auth;

  await ensureBuyerShippingFromSellerShipFrom(auth.userId);
  const wallet = await buildBuyerWalletSummary(auth.userId);
  return NextResponse.json({ wallet });
}
