import { describe, expect, it } from "vitest";
import { computeBuyerLiveShippingTotals } from "@/lib/unified-shipping-engine";
import {
  computePoolTotalsFromGroups,
  frozenPriorPurchaseProfileRow,
  packageGroupsFromProfileRows,
} from "@/services/shipping/live-shipping-pool";
import { PLATFORM_SHIPPING_PROFILE_SEEDS } from "@/lib/unified-shipping-engine";
import { standardLiveShowShippingCapIncrementCents } from "@/lib/live-show-shipping-terms";

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

    // Mixed pool is heavier (helmet dims/weight), so its uncapped raw estimate should be higher or
    // equal. (Buyer total isn't a reliable proxy here once the cap-split kicks in: a purchase that
    // triggers the split can charge LESS up front than a smaller purchase that never nears the cap —
    // that's the point of spreading the cap out instead of front-loading it.)
    expect(mixedTotal.rawEstimateCents).toBeGreaterThanOrEqual(cardsTotal.rawEstimateCents);
    expect(mixedTotal.packageCount).toBe(1);
  });

  it("buyer total never exceeds show cap", () => {
    const heavy = packageGroupsFromProfileRows([
      { itemId: "h1", profile: seedToProfileInput(helmet) },
      { itemId: "h2", profile: seedToProfileInput(helmet) },
    ]);
    const tightCap = { ...showCap, shippingCapCents: 500 };
    const totals = computePoolTotalsFromGroups(heavy, tightCap);
    // First purchase only gets the standard per-item split (not the whole tight cap at once), so the
    // cap isn't reached on purchase 1 alone — but it's still never exceeded.
    expect(totals.buyerTotalCents).toBeLessThanOrEqual(500);
    expect(totals.capReached).toBe(false);

    // Simulate enough sequential purchases in the same session to actually reach the tight cap —
    // it should climb toward 500 in per-item steps and never overshoot it.
    let already = 0;
    let capReached = false;
    for (let i = 0; i < 10 && !capReached; i++) {
      const step = computeBuyerLiveShippingTotals({
        shippingMode: "capped",
        shippingCapCents: 500,
        sellerPaysOverCap: true,
        estimatedEligibleBundleShippingCents: totals.rawEstimateCents,
        shippingAlreadyChargedCents: already,
      });
      already = step.buyerTotalShippingCents;
      capReached = step.capReached;
      expect(already).toBeLessThanOrEqual(500);
    }
    expect(capReached).toBe(true);
    expect(already).toBe(500);
  });

  it("helmet first purchase gets the standard per-item split, not the whole $9.99 cap at once", () => {
    const capped = { ...showCap, shippingCapCents: 999 };
    const increment = standardLiveShowShippingCapIncrementCents(999);
    const groups = packageGroupsFromProfileRows([
      { itemId: "h1", profile: seedToProfileInput(helmet) },
    ]);
    const totals = computePoolTotalsFromGroups(groups, capped);
    // A helmet's tier-fallback estimate alone already meets the $9.99 cap — this is exactly the
    // "front-loads the whole cap on item 1" scenario, so it should be split, not charged all at once.
    expect(totals.buyerTotalCents).toBe(increment);
    expect(totals.capReached).toBe(false);
    // Raw estimate must stay uncapped relative to buyer total when Shippo override is high.
    const withRaw = computePoolTotalsFromGroups(groups, capped, 1500);
    expect(withRaw.rawEstimateCents).toBe(1500);
    expect(withRaw.buyerTotalCents).toBe(increment);
    expect(withRaw.sellerSubsidyCents).toBe(1500 - increment);

    const due = computeBuyerLiveShippingTotals({
      shippingMode: "capped",
      shippingCapCents: 999,
      sellerPaysOverCap: true,
      estimatedEligibleBundleShippingCents: totals.rawEstimateCents,
      shippingAlreadyChargedCents: 0,
    });
    expect(due.shippingDueForThisPurchaseCents).toBe(increment);
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
    // Compare uncapped raw estimates — once a pool is heavy enough to trigger the cap-split, its
    // buyerTotalCents can actually be lower than a lighter, non-cap-triggering pool's (see above).
    expect(frozenPool.rawEstimateCents).toBeLessThan(remappedPool.rawEstimateCents);

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
