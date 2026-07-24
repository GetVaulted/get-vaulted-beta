import { describe, expect, it } from "vitest";
import { computeBuyerLiveShippingTotals } from "@/lib/unified-shipping-engine";
import {
  computePoolTotalsFromGroups,
  frozenPriorPurchaseProfileRow,
  packageGroupsFromProfileRows,
} from "@/services/shipping/live-shipping-pool";
import { PLATFORM_SHIPPING_PROFILE_SEEDS } from "@/lib/unified-shipping-engine";

const card = PLATFORM_SHIPPING_PROFILE_SEEDS.find((p) => p.slug === "trading_cards")!;
const helmet = PLATFORM_SHIPPING_PROFILE_SEEDS.find((p) => p.slug === "full_size_helmet")!;

function seedToProfileInput(seed: (typeof PLATFORM_SHIPPING_PROFILE_SEEDS)[number]) {
  return {
    id: seed.slug,
    slug: seed.slug,
    name: seed.name,
    defaultWeightOz: seed.defaultWeightOz,
    defaultLengthIn: seed.defaultLengthIn,
    defaultWidthIn: seed.defaultWidthIn,
    defaultHeightIn: seed.defaultHeightIn,
    bundleAllowed: seed.bundleAllowed,
    requiresSeparatePackage: seed.requiresSeparatePackage,
  };
}

describe("live-shipping-pool", () => {
  const showCap = {
    shippingCapEnabled: true,
    shippingCapCents: 999,
    freeShippingEnabled: false,
    sellerPaysOverCap: true,
  };

  it("cards-only pool stays in one package; cards nest into a helmet host as one package", () => {
    const cardsOnly = packageGroupsFromProfileRows([
      { itemId: "a", profile: seedToProfileInput(card) },
      { itemId: "b", profile: seedToProfileInput(card) },
    ]);
    const withHelmet = packageGroupsFromProfileRows([
      { itemId: "a", profile: seedToProfileInput(card) },
      { itemId: "b", profile: seedToProfileInput(card) },
      { itemId: "h", profile: seedToProfileInput(helmet) },
    ]);

    expect(cardsOnly).toHaveLength(1);
    // Helmet hosts nest bundleable cards — one package, not cards + separate helmet.
    expect(withHelmet).toHaveLength(1);

    const cardsTotal = computePoolTotalsFromGroups(cardsOnly, showCap);
    const mixedTotal = computePoolTotalsFromGroups(withHelmet, showCap);

    // Mixed pool is heavier (helmet dims/weight) so buyer total should be higher or equal under cap.
    expect(mixedTotal.buyerTotalCents).toBeGreaterThanOrEqual(cardsTotal.buyerTotalCents);
    expect(mixedTotal.packageCount).toBe(1);
  });

  it("buyer total never exceeds show cap", () => {
    const heavy = packageGroupsFromProfileRows([
      { itemId: "h1", profile: seedToProfileInput(helmet) },
      { itemId: "h2", profile: seedToProfileInput(helmet) },
    ]);
    const tightCap = { ...showCap, shippingCapCents: 500 };
    const totals = computePoolTotalsFromGroups(heavy, tightCap);
    expect(totals.buyerTotalCents).toBeLessThanOrEqual(500);
    expect(totals.capReached).toBe(true);
  });

  it("helmet first purchase hits the $9.99 show cap (not the $3.99 card tier)", () => {
    const capped = { ...showCap, shippingCapCents: 999 };
    const groups = packageGroupsFromProfileRows([
      { itemId: "h1", profile: seedToProfileInput(helmet) },
    ]);
    const totals = computePoolTotalsFromGroups(groups, capped);
    expect(totals.buyerTotalCents).toBe(999);
    expect(totals.capReached).toBe(true);

    const due = computeBuyerLiveShippingTotals({
      shippingMode: "capped",
      shippingCapCents: 999,
      sellerPaysOverCap: true,
      estimatedEligibleBundleShippingCents: totals.buyerTotalCents,
      shippingAlreadyChargedCents: 0,
    });
    expect(due.shippingDueForThisPurchaseCents).toBe(999);
  });

  it("does not charge shipping again after show cap was paid on a prior win", () => {
    const due = computeBuyerLiveShippingTotals({
      shippingMode: "capped",
      shippingCapCents: 999,
      sellerPaysOverCap: true,
      estimatedEligibleBundleShippingCents: 999,
      shippingAlreadyChargedCents: 999,
    });
    expect(due.shippingDueForThisPurchaseCents).toBe(0);
    expect(due.capReached).toBe(true);
  });

  it("frozen prior purchases stay light so a profile remap cannot claw back on the next win", () => {
    const capped = { ...showCap, shippingCapCents: 999 };

    // Buyer already paid card-tier shipping (~$5.99) for two light wins.
    const alreadyChargedCents = 599;
    const prior = [
      frozenPriorPurchaseProfileRow({ itemId: "old-a", appliedWeightOz: 4 }),
      frozenPriorPurchaseProfileRow({ itemId: "old-b", appliedWeightOz: 4 }),
    ];
    // Bad remap would treat those as helmets; frozen rows must not.
    const wronglyRemapped = [
      { itemId: "old-a", profile: seedToProfileInput(helmet) },
      { itemId: "old-b", profile: seedToProfileInput(helmet) },
    ];
    const frozenPool = computePoolTotalsFromGroups(packageGroupsFromProfileRows(prior), capped);
    const remappedPool = computePoolTotalsFromGroups(packageGroupsFromProfileRows(wronglyRemapped), capped);
    expect(frozenPool.buyerTotalCents).toBeLessThan(remappedPool.buyerTotalCents);

    // Next win is a real helmet — only the incremental gap to the new pool is due.
    const withNewHelmet = packageGroupsFromProfileRows([
      ...prior,
      { itemId: "new-h", profile: seedToProfileInput(helmet) },
    ]);
    const newPool = computePoolTotalsFromGroups(withNewHelmet, capped);
    const due = computeBuyerLiveShippingTotals({
      shippingMode: "capped",
      shippingCapCents: 999,
      sellerPaysOverCap: true,
      estimatedEligibleBundleShippingCents: newPool.buyerTotalCents,
      shippingAlreadyChargedCents: alreadyChargedCents,
    });
    expect(due.shippingDueForThisPurchaseCents).toBe(
      Math.max(0, newPool.buyerTotalCents - alreadyChargedCents),
    );
    // Must not jump straight to full-cap clawback just from remapping old rows.
    const remappedDue = computeBuyerLiveShippingTotals({
      shippingMode: "capped",
      shippingCapCents: 999,
      sellerPaysOverCap: true,
      estimatedEligibleBundleShippingCents: remappedPool.buyerTotalCents,
      shippingAlreadyChargedCents: alreadyChargedCents,
    });
    expect(due.shippingDueForThisPurchaseCents).toBeLessThanOrEqual(remappedDue.shippingDueForThisPurchaseCents);
  });
});
