import { describe, expect, it } from "vitest";
import {
  computeBuyerLiveShippingTotals,
  computeLiveBuyerShippingCharge,
  filterShippoRatesByCarrierPreference,
  groupItemsIntoPackages,
  resolveShippingProfileDimensions,
} from "@/lib/unified-shipping-engine";
import { DEFAULT_LIVE_SHOW_SHIPPING_CAP_CENTS } from "@/lib/live-show-shipping-terms";
import { liveRoomShippingPatchFromMode } from "@/lib/live-show-shipping-terms";
import { liveShowShippingTermsFromRoom, shippingTermsSnapshotJson } from "@/lib/live-show-shipping-terms";

const cardProfile = {
  id: "c1",
  slug: "live_break_spot",
  name: "Break Spot",
  defaultWeightOz: 4,
  defaultLengthIn: 8,
  defaultWidthIn: 6,
  defaultHeightIn: 1,
  bundleAllowed: true,
  requiresSeparatePackage: false,
  bundleGroup: "cards",
};

const helmetProfile = {
  id: "h1",
  slug: "full_size_helmet",
  name: "Full Size Helmet",
  defaultWeightOz: 80,
  defaultLengthIn: 16,
  defaultWidthIn: 14,
  defaultHeightIn: 12,
  bundleAllowed: false,
  requiresSeparatePackage: true,
  bundleGroup: "helmets_full",
  maxUnitsPerParcel: 1,
};

const cappedShow = {
  shippingMode: "capped" as const,
  shippingCapEnabled: true,
  shippingCapCents: DEFAULT_LIVE_SHOW_SHIPPING_CAP_CENTS,
  freeShippingEnabled: false,
  sellerPaysOverCap: true,
};

describe("live-show capped shipping", () => {
  it("1. first purchase below cap charges normal estimated shipping", () => {
    const result = computeBuyerLiveShippingTotals({
      shippingMode: "capped",
      shippingCapCents: 999,
      sellerPaysOverCap: true,
      estimatedEligibleBundleShippingCents: 599,
      shippingAlreadyChargedCents: 0,
    });
    expect(result.buyerTotalShippingCents).toBe(599);
    expect(result.shippingDueForThisPurchaseCents).toBe(599);
    expect(result.capReached).toBe(false);
  });

  it("2. multiple purchases stop charging once total reaches $9.99", () => {
    const first = computeBuyerLiveShippingTotals({
      shippingMode: "capped",
      shippingCapCents: 999,
      sellerPaysOverCap: true,
      estimatedEligibleBundleShippingCents: 799,
      shippingAlreadyChargedCents: 0,
    });
    expect(first.shippingDueForThisPurchaseCents).toBe(799);

    const second = computeBuyerLiveShippingTotals({
      shippingMode: "capped",
      shippingCapCents: 999,
      sellerPaysOverCap: true,
      estimatedEligibleBundleShippingCents: 999,
      shippingAlreadyChargedCents: 799,
    });
    expect(second.shippingDueForThisPurchaseCents).toBe(200);

    const third = computeBuyerLiveShippingTotals({
      shippingMode: "capped",
      shippingCapCents: 999,
      sellerPaysOverCap: true,
      estimatedEligibleBundleShippingCents: 1800,
      shippingAlreadyChargedCents: 999,
    });
    expect(third.shippingDueForThisPurchaseCents).toBe(0);
    expect(third.capReached).toBe(true);
  });

  it("3. buyer is never charged above $9.99", () => {
    const result = computeBuyerLiveShippingTotals({
      shippingMode: "capped",
      shippingCapCents: 999,
      sellerPaysOverCap: true,
      estimatedEligibleBundleShippingCents: 4500,
      shippingAlreadyChargedCents: 0,
    });
    expect(result.buyerTotalShippingCents).toBeLessThanOrEqual(999);
    expect(result.shippingDueForThisPurchaseCents).toBeLessThanOrEqual(999);
  });

  it("4. two buyers in the same show have separate shipping ledgers (incremental math)", () => {
    const buyerA = computeBuyerLiveShippingTotals({
      shippingMode: "capped",
      shippingCapCents: 999,
      sellerPaysOverCap: true,
      estimatedEligibleBundleShippingCents: 999,
      shippingAlreadyChargedCents: 0,
    });
    const buyerB = computeBuyerLiveShippingTotals({
      shippingMode: "capped",
      shippingCapCents: 999,
      sellerPaysOverCap: true,
      estimatedEligibleBundleShippingCents: 999,
      shippingAlreadyChargedCents: 0,
    });
    expect(buyerA.shippingDueForThisPurchaseCents).toBe(999);
    expect(buyerB.shippingDueForThisPurchaseCents).toBe(999);
  });

  it("5. same buyer in separate shows has separate ledgers (terms version scoped per show)", () => {
    const showA = liveShowShippingTermsFromRoom({
      shippingMode: "capped",
      shippingCapEnabled: true,
      shippingCapCents: 999,
      freeShippingEnabled: false,
      sellerPaysOverCap: true,
      shippingTermsVersion: 1,
    });
    const showB = liveShowShippingTermsFromRoom({
      shippingMode: "capped",
      shippingCapEnabled: true,
      shippingCapCents: 999,
      freeShippingEnabled: false,
      sellerPaysOverCap: true,
      shippingTermsVersion: 2,
    });
    expect(shippingTermsSnapshotJson(showA)).not.toEqual(shippingTermsSnapshotJson(showB));
  });

  it("6. multiple helmet wins create multiple parcels but remain under one buyer/show cap", () => {
    const groups = groupItemsIntoPackages([
      { itemId: "h1", profile: resolveShippingProfileDimensions(helmetProfile) },
      { itemId: "h2", profile: resolveShippingProfileDimensions(helmetProfile) },
    ]);
    expect(groups).toHaveLength(2);

    const charge = computeLiveBuyerShippingCharge({
      rawShippoEstimateCents: 2400,
      show: cappedShow,
      alreadyChargedCents: 0,
    });
    expect(charge.buyerPaysCents).toBe(999);
    expect(charge.sellerSubsidyCents).toBe(1401);
  });

  it("7. break spots use the Break Spot profile before hit results are known", () => {
    const resolved = resolveShippingProfileDimensions(cardProfile);
    expect(resolved.slug).toBe("live_break_spot");
    expect(resolved.bundleGroup).toBe("cards");
    expect(resolved.requiresSeparatePackage).toBe(false);
  });

  it("8. seller changes live shipping settings; old completed sales remain unchanged (snapshot)", () => {
    const oldTerms = shippingTermsSnapshotJson(
      liveShowShippingTermsFromRoom({
        shippingMode: "capped",
        shippingCapEnabled: true,
        shippingCapCents: 999,
        freeShippingEnabled: false,
        sellerPaysOverCap: true,
        shippingTermsVersion: 3,
      }),
    );
    const newRoomPatch = liveRoomShippingPatchFromMode({ shippingMode: "calculated" });
    expect(newRoomPatch.shippingMode).toBe("calculated");
    expect(oldTerms.shippingMode).toBe("capped");
    expect(oldTerms.shippingTermsVersion).toBe(3);
  });

  it("9. seller subsidy is correctly calculated when final label cost exceeds buyer-collected shipping", () => {
    const result = computeBuyerLiveShippingTotals({
      shippingMode: "capped",
      shippingCapCents: 999,
      sellerPaysOverCap: true,
      estimatedEligibleBundleShippingCents: 1800,
      shippingAlreadyChargedCents: 999,
    });
    expect(result.sellerShippingSubsidyCents).toBe(801);
  });

  it("11. after the show shipping cap is paid, buyer copy is Free shipping", async () => {
    const { buyerLiveShippingPaidCopy } = await import("@/lib/live-show-shipping-terms");
    expect(
      buyerLiveShippingPaidCopy({
        mode: "capped",
        paidCents: 999,
        capCents: 999,
        capReached: true,
      }),
    ).toBe("Free shipping");
    expect(
      buyerLiveShippingPaidCopy({
        mode: "calculated",
        paidCents: 999,
        capCents: 999,
        capReached: true,
      }),
    ).toBe("Free shipping");
  });

  it("10. USPS, UPS, and Best Rate only return permitted Shippo rates", () => {
    const rates = [
      { provider: "FedEx", amount: "3.00", object_id: "f1" },
      { provider: "USPS", amount: "6.50", object_id: "u2" },
      { provider: "UPS", amount: "4.25", object_id: "u1" },
    ];
    expect(filterShippoRatesByCarrierPreference(rates, "best_rate").map((r) => r.object_id)).toEqual([
      "u1",
      "u2",
    ]);
    expect(filterShippoRatesByCarrierPreference(rates, "usps").map((r) => r.object_id)).toEqual(["u2"]);
    expect(filterShippoRatesByCarrierPreference(rates, "ups").map((r) => r.object_id)).toEqual(["u1"]);
  });
});
