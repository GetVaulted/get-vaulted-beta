import { NextResponse } from "next/server";
import {
  LAYAWAY_DEPOSIT_FRACTION,
  LAYAWAY_MIN_LISTING_PRICE_USD,
  LAYAWAY_PLAN_DAYS,
} from "@/lib/layaway/constants";
import {
  LIVE_SHOW_FEE_TIER_2_THRESHOLD_USD,
  LIVE_SHOW_FEE_TIER_3_THRESHOLD_USD,
  LIVE_SHOW_TIER_1_FEE_PERCENT,
  LIVE_SHOW_TIER_2_FEE_PERCENT,
  LIVE_SHOW_TIER_3_FEE_PERCENT,
  MARKETPLACE_PLATFORM_FEE_PERCENT,
} from "@/lib/platform-fee-policy";
import { DEFAULT_INSTANT_PAYOUT_LIMITS } from "@/services/payout/instant-payout-limits";
import { PAYOUT_TIER_THRESHOLDS } from "@/services/payout/seller-payout-tier";
import { requireAdmin } from "@/lib/require-admin";

export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  return NextResponse.json({
    marketplace: {
      platformFeePercent: MARKETPLACE_PLATFORM_FEE_PERCENT,
      editable: false,
      note: "TODO: Persist fee overrides in platform settings table — currently code constants.",
    },
    liveSelling: {
      tiers: [
        { label: "Base", thresholdUsd: 0, feePercent: LIVE_SHOW_TIER_1_FEE_PERCENT },
        {
          label: "Volume",
          thresholdUsd: LIVE_SHOW_FEE_TIER_2_THRESHOLD_USD,
          feePercent: LIVE_SHOW_TIER_2_FEE_PERCENT,
        },
        {
          label: "Top",
          thresholdUsd: LIVE_SHOW_FEE_TIER_3_THRESHOLD_USD,
          feePercent: LIVE_SHOW_TIER_3_FEE_PERCENT,
        },
      ],
      editable: false,
      note: "TODO: Admin fee tier editor — currently code constants in platform-fee-policy.ts.",
    },
    payoutProgram: {
      thresholds: PAYOUT_TIER_THRESHOLDS,
      instantLimits: DEFAULT_INSTANT_PAYOUT_LIMITS,
      editable: false,
      note: "Use Seller Risk module to approve/suspend individual sellers. Tier thresholds are code constants.",
    },
    layaway: {
      minListingPriceUsd: LAYAWAY_MIN_LISTING_PRICE_USD,
      depositFraction: LAYAWAY_DEPOSIT_FRACTION,
      depositPercent: LAYAWAY_DEPOSIT_FRACTION * 100,
      planDurationsDays: LAYAWAY_PLAN_DAYS,
      editable: false,
      note: "TODO: Persist layaway policy in admin settings — currently layaway/constants.ts.",
    },
  });
}
