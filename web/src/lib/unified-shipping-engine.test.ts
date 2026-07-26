import { describe, expect, it } from "vitest";
import {
  PLATFORM_SHIPPING_PROFILE_SEEDS,
  computeLiveBuyerShippingCharge,
  computeShowShippingLiability,
  filterShippoRatesUspsUps,
  groupItemsIntoPackages,
  pickCheapestShippoRate,
  resolveShippingProfileDimensions,
  selectShippoRatesForSellerQuote,
  shipmentProfileEditLocked,
  suggestShippingProfileSlugForCategory,
} from "@/lib/unified-shipping-engine";

const helmetProfile = {
  id: "p1",
  slug: "full_size_helmet",
  name: "Full Size Helmet",
  defaultWeightOz: 80,
  defaultLengthIn: 16,
  defaultWidthIn: 14,
  defaultHeightIn: 12,
  bundleAllowed: false,
  requiresSeparatePackage: true,
};

const cardProfile = {
  id: "p2",
  slug: "trading_cards",
  name: "Trading Cards",
  defaultWeightOz: 4,
  defaultLengthIn: 6,
  defaultWidthIn: 4,
  defaultHeightIn: 1,
  bundleAllowed: true,
  requiresSeparatePackage: false,
};

describe("unified-shipping-engine", () => {
  it("suggests profile from category", () => {
    expect(suggestShippingProfileSlugForCategory("NFL Helmets")).toBe("full_size_helmet");
    expect(suggestShippingProfileSlugForCategory("Graded Slabs")).toBe("graded_card");
    expect(suggestShippingProfileSlugForCategory("Hobby Break")).toBe("trading_cards");
    expect(suggestShippingProfileSlugForCategory("Team Lot")).toBe("card_lot");
    expect(suggestShippingProfileSlugForCategory("Letter mail")).toBe("letter_envelope");
    expect(suggestShippingProfileSlugForCategory("Document envelope")).toBe("letter_envelope");
    expect(PLATFORM_SHIPPING_PROFILE_SEEDS.some((p) => p.slug === "letter_envelope")).toBe(true);
  });

  it("resolves profile dimensions with custom overrides", () => {
    const resolved = resolveShippingProfileDimensions(cardProfile, { customWeightOz: 6 });
    expect(resolved.weightOz).toBe(6);
    expect(resolved.lengthIn).toBe(6);
  });

  it("bundles card lots alone when no host package is present", () => {
    const groups = groupItemsIntoPackages([
      { itemId: "a", profile: resolveShippingProfileDimensions(cardProfile) },
      { itemId: "b", profile: resolveShippingProfileDimensions(cardProfile) },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.items.map((i) => i.itemId)).toEqual(["a", "b"]);
    expect(groups[0]!.weightOz).toBe(8);
  });

  it("nests cards into the largest helmet host so one label covers the mix", () => {
    const groups = groupItemsIntoPackages([
      { itemId: "a", profile: resolveShippingProfileDimensions(cardProfile) },
      { itemId: "b", profile: resolveShippingProfileDimensions(cardProfile) },
      { itemId: "h1", profile: resolveShippingProfileDimensions(helmetProfile) },
      { itemId: "h2", profile: resolveShippingProfileDimensions(helmetProfile) },
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0]!.items.map((i) => i.itemId)).toEqual(["h1", "a", "b"]);
    expect(groups[1]!.items.map((i) => i.itemId)).toEqual(["h2"]);
    expect(groups[0]!.weightOz).toBe(88);
    expect(groups[0]!.lengthIn).toBe(16);
    expect(groups[0]!.widthIn).toBe(14);
    expect(groups[0]!.heightIn).toBe(12);
  });

  it("keeps two full-size helmets as two packages with no nestables", () => {
    const groups = groupItemsIntoPackages([
      { itemId: "h1", profile: resolveShippingProfileDimensions(helmetProfile) },
      { itemId: "h2", profile: resolveShippingProfileDimensions(helmetProfile) },
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.every((g) => g.items.length === 1)).toBe(true);
  });

  it("applies buyer shipping cap with seller subsidy (platform max $9.99)", () => {
    const result = computeLiveBuyerShippingCharge({
      rawShippoEstimateCents: 2500,
      show: {
        shippingCapEnabled: true,
        shippingCapCents: 1500,
        freeShippingEnabled: false,
        sellerPaysOverCap: true,
      },
    });
    // Host-requested 1500 is clamped to the $9.99 platform ceiling.
    expect(result.buyerPaysCents).toBe(999);
    expect(result.sellerSubsidyCents).toBe(1501);
    expect(result.shippingCapApplied).toBe(true);
  });

  it("calculated mode still never charges the buyer more than $9.99", () => {
    const result = computeLiveBuyerShippingCharge({
      rawShippoEstimateCents: 2500,
      show: {
        shippingMode: "calculated",
        shippingCapEnabled: false,
        shippingCapCents: null,
        freeShippingEnabled: false,
        sellerPaysOverCap: true,
      },
    });
    expect(result.buyerPaysCents).toBe(999);
    expect(result.sellerSubsidyCents).toBe(1501);
  });

  it("free shipping charges buyer zero and seller absorbs all", () => {
    const result = computeLiveBuyerShippingCharge({
      rawShippoEstimateCents: 1800,
      show: {
        shippingCapEnabled: false,
        shippingCapCents: null,
        freeShippingEnabled: true,
        sellerPaysOverCap: true,
      },
    });
    expect(result.buyerPaysCents).toBe(0);
    expect(result.sellerSubsidyCents).toBe(1800);
    expect(result.freeShippingApplied).toBe(true);
  });

  it("filters Shippo rates to USPS and UPS cheapest first", () => {
    const rates = filterShippoRatesUspsUps([
      { provider: "FedEx", amount: "5.00", object_id: "f1" },
      { provider: "USPS", amount: "6.50", object_id: "u2" },
      { provider: "UPS", amount: "4.25", object_id: "u1" },
    ]);
    expect(rates.map((r) => r.object_id)).toEqual(["u1", "u2"]);
  });

  it("surfaces cheapest USPS and UPS before other services", () => {
    const rates = selectShippoRatesForSellerQuote(
      [
        { provider: "USPS", amount: "5.00", object_id: "usps-cheap", servicelevel: { name: "Ground Advantage" } },
        { provider: "USPS", amount: "8.00", object_id: "usps-pri", servicelevel: { name: "Priority" } },
        { provider: "USPS", amount: "12.00", object_id: "usps-exp", servicelevel: { name: "Express" } },
        { provider: "USPS", amount: "15.00", object_id: "usps-over", servicelevel: { name: "Priority Express" } },
        { provider: "UPS", amount: "9.50", object_id: "ups-ground", servicelevel: { name: "Ground" } },
        { provider: "FedEx", amount: "7.00", object_id: "fx", servicelevel: { name: "Ground" } },
      ],
      4,
    );
    expect(rates.map((r) => r.object_id)).toEqual(["usps-cheap", "ups-ground", "usps-pri", "usps-exp"]);
  });

  it("picks cheapest valid rate", () => {
    const cheapest = pickCheapestShippoRate([
      { provider: "USPS", amount: "9.00", object_id: "a" },
      { provider: "UPS", amount: "7.50", object_id: "b" },
    ]);
    expect(cheapest?.object_id).toBe("b");
  });

  it("locks profile edits after label creation", () => {
    expect(shipmentProfileEditLocked([{ status: "estimated" }])).toBe(false);
    expect(shipmentProfileEditLocked([{ shippoTransactionId: "tx_123" }])).toBe(true);
  });

  it("computes show shipping liability net position", () => {
    const liability = computeShowShippingLiability({
      show: {
        shippingCapEnabled: true,
        shippingCapCents: 999,
        freeShippingEnabled: false,
        sellerPaysOverCap: true,
      },
      sessions: [
        { shippingCostCents: 999, estimatedLabelCostCents: 1200, sellerShippingSubsidyCents: 201, buyerId: "b1" },
        { shippingCostCents: 999, estimatedLabelCostCents: 1800, sellerShippingSubsidyCents: 801, buyerId: "b2" },
      ],
    });
    expect(liability.collectedCents).toBe(1998);
    expect(liability.estimatedLabelCostCents).toBe(3000);
    expect(liability.netCents).toBe(-1002);
    expect(liability.buyersCount).toBe(2);
  });
});
