import { describe, expect, it } from "vitest";
import { DEFAULT_LIVE_SHOW_SHIPPING_CAP_CENTS } from "@/lib/live-show-shipping-terms";
import { buildGiveawayShippingTermsSnapshot } from "@/lib/live-giveaway-shipping";
import { computeBuyerLiveShippingTotals } from "@/lib/unified-shipping-engine";

const cappedShow = {
  shippingMode: "capped" as const,
  shippingCapEnabled: true,
  shippingCapCents: DEFAULT_LIVE_SHOW_SHIPPING_CAP_CENTS,
  freeShippingEnabled: false,
  sellerPaysOverCap: true,
  carrierPreference: "best_rate" as const,
  bundleEligiblePurchases: true,
  shippingTermsVersion: 1,
};

describe("live giveaway shipping", () => {
  it("standard giveaway charges buyer $0 and excludes from live-show cap ledger", () => {
    const snap = buildGiveawayShippingTermsSnapshot({
      orderId: "ord_giveaway_1",
      liveShowId: "room_1",
      sellerId: "seller_1",
      buyerId: "buyer_1",
      show: cappedShow,
      buyerSessionShippingChargedCents: 799,
    });

    expect(snap.isGiveaway).toBe(true);
    expect(snap.buyerPaidShippingCents).toBe(0);
    expect(snap.excludesFromLiveShowCap).toBe(true);
    expect(snap.shippingChargedThisPurchaseCents).toBe(0);
    expect(snap.totalShippingChargedSoFarCents).toBe(799);
  });

  it("no explicit buyer-paid giveaway shipping rule exists — defaults remain $0", () => {
    const snap = buildGiveawayShippingTermsSnapshot({
      orderId: "ord_giveaway_2",
      liveShowId: "room_1",
      sellerId: "seller_1",
      buyerId: "buyer_1",
      show: cappedShow,
    });

    expect(snap.buyerPaidShippingCents).toBe(0);
    expect(snap.shippingChargedThisPurchaseCents).toBe(0);
    expect(snap.excludesFromLiveShowCap).toBe(true);
  });

  it("giveaway in a capped show does not increase buyer cap math for paid purchases", () => {
    const alreadyChargedFromPaidPurchases = 799;
    const giveawaySnap = buildGiveawayShippingTermsSnapshot({
      orderId: "ord_giveaway_3",
      liveShowId: "room_1",
      sellerId: "seller_1",
      buyerId: "buyer_1",
      show: cappedShow,
      buyerSessionShippingChargedCents: alreadyChargedFromPaidPurchases,
    });

    const nextPaidPurchase = computeBuyerLiveShippingTotals({
      shippingMode: "capped",
      shippingCapCents: DEFAULT_LIVE_SHOW_SHIPPING_CAP_CENTS,
      sellerPaysOverCap: true,
      estimatedEligibleBundleShippingCents: 999,
      shippingAlreadyChargedCents: alreadyChargedFromPaidPurchases,
    });

    expect(giveawaySnap.shippingChargedThisPurchaseCents).toBe(0);
    expect(giveawaySnap.totalShippingChargedSoFarCents).toBe(alreadyChargedFromPaidPurchases);
    expect(nextPaidPurchase.shippingDueForThisPurchaseCents).toBe(200);
    expect(alreadyChargedFromPaidPurchases + nextPaidPurchase.shippingDueForThisPurchaseCents).toBeLessThanOrEqual(
      DEFAULT_LIVE_SHOW_SHIPPING_CAP_CENTS,
    );
  });
});
