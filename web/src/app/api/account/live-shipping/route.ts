import { NextResponse } from "next/server";
import { authOptions, getServerSessionSafe } from "@/lib/auth";
import { getSellerLiveShippingDashboard } from "@/services/account/seller-live-shipping-dashboard";
import { processAuctionPaymentExpiries } from "@/services/payments";

export const runtime = "nodejs";

export async function GET() {
  const session = await getServerSessionSafe();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await processAuctionPaymentExpiries();

  const data = await getSellerLiveShippingDashboard(session.user.id);
  return NextResponse.json(data);
}
