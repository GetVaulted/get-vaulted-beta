import { NextResponse } from "next/server";
import { fetchBuyerLiveOrders } from "@/lib/buyer-live-orders";
import { reconcileBuyerPendingVariantPurchases } from "@/lib/live-payment-pipeline";
import { resolveAccountUserId } from "@/lib/resolve-account-auth";

export async function GET(req: Request) {
  const auth = await resolveAccountUserId(req);
  if (auth instanceof NextResponse) return auth;

  try {
    await reconcileBuyerPendingVariantPurchases(auth.userId);
  } catch (e) {
    console.error("[api/account/live-orders] reconcile pending variant purchases", e);
  }

  const orders = await fetchBuyerLiveOrders(auth.userId);
  return NextResponse.json({ orders });
}
