import { NextResponse } from "next/server";
import { fetchBuyerLiveOrders } from "@/lib/buyer-live-orders";
import { resolveAccountUserId } from "@/lib/resolve-account-auth";

export async function GET(req: Request) {
  const auth = await resolveAccountUserId(req);
  if (auth instanceof NextResponse) return auth;

  const orders = await fetchBuyerLiveOrders(auth.userId);
  return NextResponse.json({ orders });
}
