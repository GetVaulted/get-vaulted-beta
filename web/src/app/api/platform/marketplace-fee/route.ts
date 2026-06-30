import { NextResponse } from "next/server";
import {
  ensureMarketplacePlatformFeeCache,
  formatMarketplaceFeeRateLabel,
} from "@/services/platform-fee-settings";

export const runtime = "nodejs";

/** Public marketplace platform fee for seller apps (mobile create listing, payout previews). */
export async function GET() {
  const platformFeePercent = await ensureMarketplacePlatformFeeCache(true);
  return NextResponse.json({
    platformFeePercent,
    feeRateLabel: formatMarketplaceFeeRateLabel(platformFeePercent),
  });
}
