import { NextResponse } from "next/server";
import { isEscrowConfigured, isEscrowFeaturesEnabled } from "@/lib/escrow-config";
import { resolveAccountSellerUserId } from "@/lib/resolve-account-seller-user";
import { getSellerLiveReadiness } from "@/services/seller/live-show-readiness";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = await resolveAccountSellerUserId(req);
  if (auth instanceof NextResponse) return auth;

  const readiness = await getSellerLiveReadiness(auth.userId);
  return NextResponse.json({
    ...readiness,
    highValueCheckoutConfigured: isEscrowFeaturesEnabled() && isEscrowConfigured(),
  });
}
