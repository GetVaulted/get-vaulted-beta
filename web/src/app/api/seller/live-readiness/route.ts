import { NextResponse } from "next/server";
import { authOptions, getServerSessionSafe } from "@/lib/auth";
import { isEscrowConfigured, isEscrowFeaturesEnabled } from "@/lib/escrow-config";
import { getSellerLiveReadiness } from "@/services/seller/live-show-readiness";

export const runtime = "nodejs";

export async function GET() {
  const session = await getServerSessionSafe();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const readiness = await getSellerLiveReadiness(session.user.id);
  return NextResponse.json({
    ...readiness,
    highValueCheckoutConfigured: isEscrowFeaturesEnabled() && isEscrowConfigured(),
  });
}
