import { describe, expect, it } from "vitest";
import {
  computeLiveBuyerShippingCharge,
  computeShowShippingLiability,
  filterShippoRatesUspsUps,
  groupItemsIntoPackages,
  pickCheapestShippoRate,
  resolveShippingProfileDimensions,
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
  });

  it("resolves profile dimensions with custom overrides", () => {
    const resolved = resolveShippingProfileDimensions(cardProfile, { customWeightOz: 6 });
    expect(resolved.weightOz).toBe(6);
    expect(resolved.lengthIn).toBe(6);
  });

  it("bundles card lots and splits helmets into separate packages", () => {
    const groups = groupItemsIntoPackages([
      { itemId: "a", profile: resolveShippingProfileDimensions(cardProfile) },
      { itemId: "b", profile: resolveShippingProfileDimensions(cardProfile) },
      { itemId: "h1", profile: resolveShippingProfileDimensions(helmetProfile) },
      { itemId: "h2", profile: resolveShippingProfileDimensions(helmetProfile) },
    ]);
    expect(groups).toHaveLength(3);
    expect(groups[0]!.items).toHaveLength(2);
    expect(groups[1]!.items).toHaveLength(1);
    expect(groups[2]!.items).toHaveLength(1);
  });

  it("applies buyer shipping cap with seller subsidy", () => {
    const result = computeLiveBuyerShippingCharge({
      rawShippoEstimateCents: 2500,
      show: {
        shippingCapEnabled: true,
        shippingCapCents: 1500,
        freeShippingEnabled: false,
        sellerPaysOverCap: true,
      },
    });
    expect(result.buyerPaysCents).toBe(1500);
    expect(result.sellerSubsidyCents).toBe(1000);
    expect(result.shippingCapApplied).toBe(true);
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
        shippingCapCents: 1500,
        freeShippingEnabled: false,
        sellerPaysOverCap: true,
      },
      sessions: [
        { shippingCostCents: 1500, estimatedLabelCostCents: 1200, sellerShippingSubsidyCents: 0, buyerId: "b1" },
        { shippingCostCents: 1500, estimatedLabelCostCents: 1800, sellerShippingSubsidyCents: 300, buyerId: "b2" },
      ],
    });
    expect(liability.collectedCents).toBe(3000);
    expect(liability.estimatedLabelCostCents).toBe(3000);
    expect(liability.netCents).toBe(0);
    expect(liability.buyersCount).toBe(2);
  });
});
