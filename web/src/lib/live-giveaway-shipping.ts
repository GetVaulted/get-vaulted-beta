import type { LiveShowCarrierPreference, LiveShowShippingMode } from "@/generated/prisma/enums";
import { liveShowShippingTermsFromRoom } from "@/lib/live-show-shipping-terms";

export type GiveawayShippingTermsSnapshot = {
  liveShowId: string;
  sellerId: string;
  buyerId: string;
  isGiveaway: true;
  buyerPaidShippingCents: 0;
  excludesFromLiveShowCap: true;
  shippingMode: LiveShowShippingMode;
  shippingCapCents: number | null;
  carrierPreference: LiveShowCarrierPreference;
  bundleEligiblePurchases: boolean;
  estimatedShippingBeforePurchaseCents: number;
  shippingChargedThisPurchaseCents: 0;
  totalShippingChargedSoFarCents: number;
  shippingTermsVersion: number;
  capturedAt: string;
  idempotencyKey: string;
};

type ShowShippingRow = Parameters<typeof liveShowShippingTermsFromRoom>[0];

/** Giveaway prizes never charge buyer shipping or consume live-show cap unless explicitly configured elsewhere. */
export function buildGiveawayShippingTermsSnapshot(args: {
  orderId: string;
  liveShowId: string;
  sellerId: string;
  buyerId: string;
  show: ShowShippingRow;
  buyerSessionShippingChargedCents?: number | null;
  capturedAt?: string;
}): GiveawayShippingTermsSnapshot {
  const showTerms = liveShowShippingTermsFromRoom(args.show);
  const priorCharged = Math.max(0, Math.floor(args.buyerSessionShippingChargedCents ?? 0));
  return {
    liveShowId: args.liveShowId,
    sellerId: args.sellerId,
    buyerId: args.buyerId,
    isGiveaway: true,
    buyerPaidShippingCents: 0,
    excludesFromLiveShowCap: true,
    shippingMode: showTerms.shippingMode,
    shippingCapCents: showTerms.shippingCapCents,
    carrierPreference: showTerms.carrierPreference,
    bundleEligiblePurchases: showTerms.bundleEligiblePurchases,
    estimatedShippingBeforePurchaseCents: priorCharged,
    shippingChargedThisPurchaseCents: 0,
    totalShippingChargedSoFarCents: priorCharged,
    shippingTermsVersion: showTerms.shippingTermsVersion,
    capturedAt: args.capturedAt ?? new Date().toISOString(),
    idempotencyKey: args.orderId,
  };
}
