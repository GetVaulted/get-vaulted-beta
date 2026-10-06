import { describe, expect, it, vi } from "vitest";
import { computeBuyerLiveShippingTotals } from "@/lib/unified-shipping-engine";
import {
  hasLiveShippingTermsSnapshot,
  resolveLiveSessionRawEstimateCents,
  resolvePayOrderLiveShippingUsd,
} from "@/services/shipping/live-commerce-shipping-settlement";
import { calculateLiveShippingCost } from "@/services/shipping/live-shipping-tier-estimate";
import { computePoolTotalsFromGroups } from "@/services/shipping/live-shipping-pool";
import type { PackageGroup } from "@/lib/unified-shipping-engine";
import { standardLiveShowShippingCapIncrementCents } from "@/lib/live-show-shipping-terms";

describe("live shipping math audit fixes", () => {
  describe("tier estimate uncapped", () => {
    it("does not clamp heavy tiers to the buyer platform max", () => {
      vi.stubEnv(
        "LIVE_SHIPPING_TIERS_JSON",
        JSON.stringify([
          { maxWeightOz: 4, costCents: 399 },
          { maxWeightOz: 1000000, costCents: 1499 },
        ]),
      );
      try {
        expect(calculateLiveShippingCost(80, 999)).toBe(1499);
      } finally {
        vi.unstubAllEnvs();
      }
    });
  });

  describe("pool raw vs buyer total", () => {
    it("keeps raw above buyer total so subsidy is non-zero under cap", () => {
      const heavyGroups: PackageGroup[] = [
        {
          packageIndex: 0,
          weightOz: 80,
          lengthIn: 16,
          widthIn: 14,
          heightIn: 12,
          items: [
            {
              itemId: "h1",
              profile: {
                id: "h",
                slug: "full_size_helmet",
                name: "Helmet",
                weightOz: 80,
                lengthIn: 16,
                widthIn: 14,
                heightIn: 12,
                bundleAllowed: false,
                requiresSeparatePackage: true,
                bundleGroup: "helmets_full",
                maxUnitsPerParcel: 1,
              },
            },
          ],
        },
      ];
      const increment = standardLiveShowShippingCapIncrementCents(999);
      const totals = computePoolTotalsFromGroups(
        heavyGroups,
        {
          shippingCapEnabled: true,
          shippingCapCents: 999,
          freeShippingEnabled: false,
          sellerPaysOverCap: true,
          shippingMode: "capped",
        },
        1800,
      );
      expect(totals.rawEstimateCents).toBe(1800);
      // Real cost (1800) already meets the cap, so this first purchase gets the standard per-item
      // split, not the whole cap — the seller subsidizes the rest, same as before but a bigger slice.
      expect(totals.buyerTotalCents).toBe(increment);
      expect(totals.sellerSubsidyCents).toBe(1800 - increment);

      const settleLike = computeBuyerLiveShippingTotals({
        shippingMode: "capped",
        shippingCapCents: 999,
        sellerPaysOverCap: true,
        estimatedEligibleBundleShippingCents: resolveLiveSessionRawEstimateCents({
          shippingCostCents: totals.buyerTotalCents,
          estimatedLabelCostCents: totals.rawEstimateCents,
        }),
        shippingAlreadyChargedCents: 0,
      });
      expect(settleLike.sellerShippingSubsidyCents).toBe(1800 - increment);
      expect(settleLike.shippingDueForThisPurchaseCents).toBe(increment);
    });

    it("does not collapse subsidy when only shippingCostCents is present (legacy)", () => {
      // Legacy rows without estimatedLabelCostCents cannot recover true subsidy.
      const raw = resolveLiveSessionRawEstimateCents({
        shippingCostCents: 999,
        estimatedLabelCostCents: null,
      });
      expect(raw).toBe(999);
      const totals = computeBuyerLiveShippingTotals({
        shippingMode: "capped",
        shippingCapCents: 999,
        sellerPaysOverCap: true,
        estimatedEligibleBundleShippingCents: raw,
        shippingAlreadyChargedCents: 0,
      });
      // Raw (999) meets the cap exactly, so this purchase gets the standard per-item split rather
      // than the full amount — the gap between what was charged and the fallback raw is now a real,
      // non-zero subsidy (previously this degenerate case happened to collapse subsidy to 0).
      const increment = standardLiveShowShippingCapIncrementCents(999);
      expect(totals.sellerShippingSubsidyCents).toBe(999 - increment);
    });
  });

  describe("pay_order snapshot immutability", () => {
    it("detects settled snapshots", () => {
      expect(hasLiveShippingTermsSnapshot(null)).toBe(false);
      expect(hasLiveShippingTermsSnapshot({ shippingChargedThisPurchaseCents: 499 })).toBe(true);
    });

    it("keeps settled order shipping when session estimate moves", () => {
      const usd = resolvePayOrderLiveShippingUsd({
        orderShippingPriceUsd: 4.99,
        shippingTermsSnapshotJson: {
          shippingChargedThisPurchaseCents: 499,
          totalShippingChargedSoFarCents: 499,
        },
        sessionShippingCostCents: 999,
        siblingPaidShippingCents: 0,
      });
      expect(usd).toBe(4.99);
    });

    it("recomputes remaining session balance only when unsettled", () => {
      const usd = resolvePayOrderLiveShippingUsd({
        orderShippingPriceUsd: 0,
        shippingTermsSnapshotJson: null,
        sessionShippingCostCents: 999,
        siblingPaidShippingCents: 400,
      });
      expect(usd).toBe(5.99);
    });
  });
});
