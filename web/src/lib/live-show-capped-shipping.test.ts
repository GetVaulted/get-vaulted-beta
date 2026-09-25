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
import { standardLiveShowShippingCapIncrementCents } from "@/lib/live-show-shipping-terms";

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
    // Both buyers' first purchase already meets the cap, so both get the standard per-item split
    // (not the whole cap at once) — and, being separate ledgers, both see the exact same charge.
    const expectedFirstCharge = standardLiveShowShippingCapIncrementCents(999);
    expect(buyerA.shippingDueForThisPurchaseCents).toBe(expectedFirstCharge);
    expect(buyerB.shippingDueForThisPurchaseCents).toBe(expectedFirstCharge);
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
    // Real cost (2400) already meets the $9.99 cap, so this purchase gets the standard per-item split
    // instead of the whole cap up front — the seller subsidizes the rest.
    const expectedCharge = standardLiveShowShippingCapIncrementCents(999);
    expect(charge.buyerPaysCents).toBe(expectedCharge);
    expect(charge.sellerSubsidyCents).toBe(2400 - expectedCharge);
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

  describe("standard per-item cap split (always on, scaled to the cap — not a seller setting)", () => {
    // Reproduces the reported break scenario: two full-size helmets (expensive to ship alone) plus
    // card mailers in the same show, cap $9.99. Buyers should see three equal per-item charges that
    // sum to the cap, then free — never the whole $9.99 up front on item 1. This is the mandatory
    // engine behavior for every capped live show; there is no setting that turns it off.
    it("splits the cap into standard per-item charges instead of front-loading it on the first item", () => {
      const cap = 999;
      const increment = standardLiveShowShippingCapIncrementCents(cap); // 333 for a $9.99 cap
      const base = {
        shippingMode: "capped" as const,
        shippingCapCents: cap,
        sellerPaysOverCap: true,
      };

      const p1 = computeBuyerLiveShippingTotals({
        ...base,
        estimatedEligibleBundleShippingCents: 1800, // helmet #1's real cost alone would already meet the cap
        shippingAlreadyChargedCents: 0,
      });
      expect(p1.shippingDueForThisPurchaseCents).toBe(increment);
      expect(p1.buyerTotalShippingCents).toBe(increment);
      expect(p1.capReached).toBe(false);

      const p2 = computeBuyerLiveShippingTotals({
        ...base,
        estimatedEligibleBundleShippingCents: 3600, // helmet #2 added to the pool
        shippingAlreadyChargedCents: p1.buyerTotalShippingCents,
      });
      expect(p2.shippingDueForThisPurchaseCents).toBe(increment);
      expect(p2.buyerTotalShippingCents).toBe(increment * 2);

      const p3 = computeBuyerLiveShippingTotals({
        ...base,
        estimatedEligibleBundleShippingCents: 4000, // first card mailer added
        shippingAlreadyChargedCents: p2.buyerTotalShippingCents,
      });
      expect(p3.shippingDueForThisPurchaseCents).toBe(increment);
      expect(p3.buyerTotalShippingCents).toBe(cap); // 3 * 333 = 999, cap met exactly
      expect(p3.capReached).toBe(true);

      const p4 = computeBuyerLiveShippingTotals({
        ...base,
        estimatedEligibleBundleShippingCents: 4400, // second card mailer — cap already met
        shippingAlreadyChargedCents: p3.buyerTotalShippingCents,
      });
      expect(p4.shippingDueForThisPurchaseCents).toBe(0);
      expect(p4.buyerTotalShippingCents).toBe(cap);
      expect(p4.capReached).toBe(true);
    });

    it("a cap that doesn't divide evenly by 3 puts the rounding remainder on the last charge", () => {
      const cap = 1000; // $10.00 — increment rounds to 333, leaving a 1-cent remainder
      const increment = standardLiveShowShippingCapIncrementCents(cap);
      expect(increment).toBe(333);
      const base = { shippingMode: "capped" as const, shippingCapCents: cap, sellerPaysOverCap: true };

      const p1 = computeBuyerLiveShippingTotals({ ...base, estimatedEligibleBundleShippingCents: 5000, shippingAlreadyChargedCents: 0 });
      expect(p1.shippingDueForThisPurchaseCents).toBe(333);
      const p2 = computeBuyerLiveShippingTotals({ ...base, estimatedEligibleBundleShippingCents: 5000, shippingAlreadyChargedCents: p1.buyerTotalShippingCents });
      expect(p2.shippingDueForThisPurchaseCents).toBe(333);
      const p3 = computeBuyerLiveShippingTotals({ ...base, estimatedEligibleBundleShippingCents: 5000, shippingAlreadyChargedCents: p2.buyerTotalShippingCents });
      expect(p3.shippingDueForThisPurchaseCents).toBe(333);
      expect(p3.buyerTotalShippingCents).toBe(999);
      expect(p3.capReached).toBe(false); // 1 cent still left
      const p4 = computeBuyerLiveShippingTotals({ ...base, estimatedEligibleBundleShippingCents: 5000, shippingAlreadyChargedCents: p3.buyerTotalShippingCents });
      expect(p4.shippingDueForThisPurchaseCents).toBe(1);
      expect(p4.buyerTotalShippingCents).toBe(1000);
      expect(p4.capReached).toBe(true);
    });

    it("a purchase that would never reach the cap on its own just pays its real cost, uncapped", () => {
      // A single moderately-priced item (e.g. real cost $5.99) under a $9.99 cap was never going to
      // trigger the "whole cap on one item" bug — it should be charged its real cost, not truncated
      // down to the per-item split amount.
      const result = computeBuyerLiveShippingTotals({
        shippingMode: "capped",
        shippingCapCents: 999,
        sellerPaysOverCap: true,
        estimatedEligibleBundleShippingCents: 599,
        shippingAlreadyChargedCents: 0,
      });
      expect(result.shippingDueForThisPurchaseCents).toBe(599);
      expect(result.sellerShippingSubsidyCents).toBe(0);
    });

    it("never charges more than the real remaining estimated cost, even mid-split", () => {
      // Later item's real incremental cost is cheap, so the split shouldn't overshoot it even though
      // there's still room left under the cap.
      const result = computeBuyerLiveShippingTotals({
        shippingMode: "capped",
        shippingCapCents: 999,
        sellerPaysOverCap: true,
        estimatedEligibleBundleShippingCents: 750,
        shippingAlreadyChargedCents: 600,
      });
      expect(result.shippingDueForThisPurchaseCents).toBe(150);
      expect(result.buyerTotalShippingCents).toBe(750);
    });

    it("calculated mode is unaffected — no split, real cost up to the platform max", () => {
      const result = computeBuyerLiveShippingTotals({
        shippingMode: "calculated",
        shippingCapCents: null,
        sellerPaysOverCap: true,
        estimatedEligibleBundleShippingCents: 1800,
        shippingAlreadyChargedCents: 0,
      });
      expect(result.shippingDueForThisPurchaseCents).toBe(999);
    });
  });
});
