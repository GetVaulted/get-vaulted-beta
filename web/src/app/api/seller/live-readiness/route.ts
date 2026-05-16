import { NextResponse } from "next/server";
import { isEscrowConfigured, isEscrowFeaturesEnabled } from "@/lib/escrow-config";
import { resolveLiveRoomsUserId } from "@/lib/resolve-live-rooms-auth";
import { getSellerLiveReadiness } from "@/services/seller/live-show-readiness";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = await resolveLiveRoomsUserId(req);
  if (auth instanceof NextResponse) return auth;

  const readiness = await getSellerLiveReadiness(auth.userId);
  return NextResponse.json({
    ...readiness,
    highValueCheckoutConfigured: isEscrowFeaturesEnabled() && isEscrowConfigured(),
  });
}
