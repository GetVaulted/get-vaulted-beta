import { describe, expect, it } from "vitest";
import {
  computePoolTotalsFromGroups,
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
    shippingCapCents: 1200,
    freeShippingEnabled: false,
    sellerPaysOverCap: true,
  };

  it("cards-only pool stays in one package with lower total than cards + helmet", () => {
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
    expect(withHelmet.length).toBeGreaterThanOrEqual(2);

    const cardsTotal = computePoolTotalsFromGroups(cardsOnly, showCap);
    const mixedTotal = computePoolTotalsFromGroups(withHelmet, showCap);

    expect(mixedTotal.buyerTotalCents).toBeGreaterThan(cardsTotal.buyerTotalCents);
    expect(mixedTotal.packageCount).toBeGreaterThan(cardsTotal.packageCount);
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
});
