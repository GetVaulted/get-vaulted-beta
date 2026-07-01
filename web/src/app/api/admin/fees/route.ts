import { NextResponse } from "next/server";
import {
  LAYAWAY_DEPOSIT_FRACTION,
  LAYAWAY_MIN_LISTING_PRICE_USD,
  LAYAWAY_PLAN_DAYS,
} from "@/lib/layaway/constants";
import { MARKETPLACE_PLATFORM_FEE_PERCENT } from "@/lib/platform-fee-policy";
import {
  ensureLiveShowFeeCache,
  getLiveShowFeeConfig,
  liveShowFeeTiersFromConfig,
  setLiveShowFeeConfig,
  type LiveShowFeeConfig,
} from "@/services/live-show-fee-settings";
import {
  ensurePayoutProgramCache,
  getPayoutProgramConfig,
  setPayoutProgramConfig,
} from "@/services/payout/payout-program-settings";
import type { PayoutProgramConfig } from "@/lib/stripe-instant-payout-reference";
import {
  formatMarketplaceFeeRateLabel,
  getMarketplacePlatformFeeConfig,
  setMarketplacePlatformFeePercent,
} from "@/services/platform-fee-settings";
import { requireAdmin } from "@/lib/require-admin";

export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const [marketplaceConfig, liveShowConfig, payoutProgram] = await Promise.all([
    getMarketplacePlatformFeeConfig(),
    getLiveShowFeeConfig(),
    getPayoutProgramConfig(),
  ]);

  return NextResponse.json({
    marketplace: {
      platformFeePercent: marketplaceConfig.platformFeePercent,
      feeRateLabel: formatMarketplaceFeeRateLabel(marketplaceConfig.platformFeePercent),
      defaultPlatformFeePercent: MARKETPLACE_PLATFORM_FEE_PERCENT,
      editable: true,
      updatedAt: marketplaceConfig.updatedAt?.toISOString() ?? null,
      note: "Applies to marketplace buy-now and layaway checkout. Stripe card processing is separate.",
    },
    liveSelling: {
      tiers: liveShowFeeTiersFromConfig(liveShowConfig.config),
      config: liveShowConfig.config,
      editable: true,
      updatedAt: liveShowConfig.updatedAt?.toISOString() ?? null,
      note: "Applies to live auction, buy-now, and break sales. Tier is based on completed show GMV before each sale.",
    },
    payoutProgram: {
      config: payoutProgram.config,
      thresholds: payoutProgram.config.thresholds,
      instantLimits: payoutProgram.config.instantLimits,
      instantSuspensionRateCeiling: payoutProgram.config.instantSuspensionRateCeiling,
      editable: true,
      updatedAt: payoutProgram.updatedAt?.toISOString() ?? null,
      note:
        "Instant limits default to Stripe US rules ($9,999/payout, 10/day, 60+ days processing). Fast tier is Get Vaulted policy. Admin still approves instant sellers individually.",
    },
    layaway: {
      minListingPriceUsd: LAYAWAY_MIN_LISTING_PRICE_USD,
      depositFraction: LAYAWAY_DEPOSIT_FRACTION,
      depositPercent: LAYAWAY_DEPOSIT_FRACTION * 100,
      planDurationsDays: LAYAWAY_PLAN_DAYS,
      editable: false,
      note: "Layaway policy is code constants for now.",
    },
  });
}

type PatchBody = {
  marketplacePlatformFeePercent?: unknown;
  liveSelling?: Partial<Record<keyof LiveShowFeeConfig, unknown>>;
  payoutProgram?: Partial<PayoutProgramConfig> & {
    thresholds?: Partial<PayoutProgramConfig["thresholds"]> & {
      fast?: Partial<PayoutProgramConfig["thresholds"]["fast"]>;
      instant?: Partial<PayoutProgramConfig["thresholds"]["instant"]>;
    };
    instantLimits?: Partial<PayoutProgramConfig["instantLimits"]>;
  };
};

function parseOptionalNumber(raw: unknown): number | undefined {
  if (raw == null || raw === "") return undefined;
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw.trim()) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

export async function PATCH(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const hasMarketplace = body.marketplacePlatformFeePercent != null;
  const livePatch = body.liveSelling;
  const hasLive =
    livePatch != null &&
    typeof livePatch === "object" &&
    (livePatch.tier1FeePercent != null ||
      livePatch.tier2ThresholdUsd != null ||
      livePatch.tier2FeePercent != null ||
      livePatch.tier3ThresholdUsd != null ||
      livePatch.tier3FeePercent != null);

  const payoutPatch = body.payoutProgram;
  const hasPayout =
    payoutPatch != null &&
    typeof payoutPatch === "object" &&
    (payoutPatch.instantSuspensionRateCeiling != null ||
      payoutPatch.thresholds != null ||
      payoutPatch.instantLimits != null);

  if (!hasMarketplace && !hasLive && !hasPayout) {
    return NextResponse.json({ error: "No supported fee fields to update." }, { status: 400 });
  }

  let marketplaceResponse: { platformFeePercent: number; feeRateLabel: string } | undefined;
  if (hasMarketplace) {
    const n = parseOptionalNumber(body.marketplacePlatformFeePercent);
    if (n == null) {
      return NextResponse.json({ error: "marketplacePlatformFeePercent must be a number." }, { status: 400 });
    }
    const platformFeePercent = await setMarketplacePlatformFeePercent(n, gate.userId);
    marketplaceResponse = {
      platformFeePercent,
      feeRateLabel: formatMarketplaceFeeRateLabel(platformFeePercent),
    };
  }

  let liveResponse: { config: LiveShowFeeConfig; tiers: ReturnType<typeof liveShowFeeTiersFromConfig> } | undefined;
  if (hasLive && livePatch) {
    const patch: Partial<LiveShowFeeConfig> = {};
    const tier1 = parseOptionalNumber(livePatch.tier1FeePercent);
    const tier2Threshold = parseOptionalNumber(livePatch.tier2ThresholdUsd);
    const tier2Fee = parseOptionalNumber(livePatch.tier2FeePercent);
    const tier3Threshold = parseOptionalNumber(livePatch.tier3ThresholdUsd);
    const tier3Fee = parseOptionalNumber(livePatch.tier3FeePercent);

    if (livePatch.tier1FeePercent != null && tier1 == null) {
      return NextResponse.json({ error: "tier1FeePercent must be a number." }, { status: 400 });
    }
    if (livePatch.tier2ThresholdUsd != null && tier2Threshold == null) {
      return NextResponse.json({ error: "tier2ThresholdUsd must be a number." }, { status: 400 });
    }
    if (livePatch.tier2FeePercent != null && tier2Fee == null) {
      return NextResponse.json({ error: "tier2FeePercent must be a number." }, { status: 400 });
    }
    if (livePatch.tier3ThresholdUsd != null && tier3Threshold == null) {
      return NextResponse.json({ error: "tier3ThresholdUsd must be a number." }, { status: 400 });
    }
    if (livePatch.tier3FeePercent != null && tier3Fee == null) {
      return NextResponse.json({ error: "tier3FeePercent must be a number." }, { status: 400 });
    }

    if (tier1 != null) patch.tier1FeePercent = tier1;
    if (tier2Threshold != null) patch.tier2ThresholdUsd = tier2Threshold;
    if (tier2Fee != null) patch.tier2FeePercent = tier2Fee;
    if (tier3Threshold != null) patch.tier3ThresholdUsd = tier3Threshold;
    if (tier3Fee != null) patch.tier3FeePercent = tier3Fee;

    const config = await setLiveShowFeeConfig(patch, gate.userId);
    await ensureLiveShowFeeCache(true);
    liveResponse = { config, tiers: liveShowFeeTiersFromConfig(config) };
  }

  let payoutResponse: { config: PayoutProgramConfig } | undefined;
  if (hasPayout && payoutPatch) {
    const config = await setPayoutProgramConfig(payoutPatch, gate.userId);
    await ensurePayoutProgramCache(true);
    payoutResponse = { config };
  }

  return NextResponse.json({
    ok: true,
    marketplace: marketplaceResponse,
    liveSelling: liveResponse,
    payoutProgram: payoutResponse,
  });
}
