import { describe, expect, it } from "vitest";
import {
  formatShipsFromRegion,
  getSellerFulfillmentReadinessIssues,
  hasCompleteSellerShipFrom,
  hasStripeConnectReady,
  sellerHasShipFromAddress,
} from "@/lib/seller-shipping-readiness";

const baseSeller = {
  stripeAccountId: "acct_1",
  stripeOnboardingComplete: true,
  shipFromStreet: "1 Main",
  shipFromCity: "Austin",
  shipFromState: "TX",
  shipFromZip: "78701",
  shipFromCountry: "US",
  shipFromPhone: "5551234567",
};

const baseParcel = {
  parcelWeightOz: 16,
  parcelLengthIn: 10,
  parcelWidthIn: 8,
  parcelHeightIn: 4,
};

describe("hasStripeConnectReady", () => {
  it("requires account id and onboarding flag", () => {
    expect(hasStripeConnectReady({ stripeAccountId: null, stripeOnboardingComplete: true })).toBe(false);
    expect(hasStripeConnectReady({ stripeAccountId: "x", stripeOnboardingComplete: false })).toBe(false);
    expect(hasStripeConnectReady({ stripeAccountId: "x", stripeOnboardingComplete: true })).toBe(true);
  });
});

describe("hasCompleteSellerShipFrom", () => {
  it("requires core address fields and contact phone", () => {
    expect(
      hasCompleteSellerShipFrom({
        ...baseSeller,
        shipFromZip: "",
      }),
    ).toBe(false);
    expect(
      hasCompleteSellerShipFrom({
        ...baseSeller,
        shipFromPhone: null,
      }),
    ).toBe(false);
    expect(hasCompleteSellerShipFrom(baseSeller)).toBe(true);
  });
});

describe("formatShipsFromRegion", () => {
  it("combines state and country", () => {
    expect(formatShipsFromRegion("TX", "US")).toBe("TX, US");
  });
});

describe("getSellerFulfillmentReadinessIssues", () => {
  it("lists all gaps for draft", () => {
    const issues = getSellerFulfillmentReadinessIssues({
      listingStatus: "draft",
      parcel: { parcelWeightOz: null, parcelLengthIn: null, parcelWidthIn: null, parcelHeightIn: null },
      seller: {
        stripeAccountId: null,
        stripeOnboardingComplete: false,
        shipFromStreet: null,
        shipFromCity: null,
        shipFromState: null,
        shipFromZip: null,
        shipFromCountry: null,
      },
    });
    expect(issues.map((i) => i.code).sort()).toEqual(["parcel", "ship_from", "stripe"]);
    expect(issues.every((i) => i.severity === "warning")).toBe(true);
  });

  it("uses error severity for published listing with gaps", () => {
    const issues = getSellerFulfillmentReadinessIssues({
      listingStatus: "active",
      parcel: { parcelWeightOz: null, parcelLengthIn: null, parcelWidthIn: null, parcelHeightIn: null },
      seller: { ...baseSeller, shipFromStreet: null },
    });
    expect(issues.find((i) => i.code === "parcel")?.severity).toBe("error");
    expect(issues.find((i) => i.code === "ship_from")?.severity).toBe("error");
  });

  it("returns empty when everything complete on active listing", () => {
    const issues = getSellerFulfillmentReadinessIssues({
      listingStatus: "active",
      parcel: baseParcel,
      seller: baseSeller,
    });
    expect(issues).toHaveLength(0);
  });
});

describe("sellerHasShipFromAddress", () => {
  it("falls back to seller profile when readiness checks are stale", () => {
    expect(
      sellerHasShipFromAddress({ hasShipFromAddress: false }, baseSeller),
    ).toBe(true);
  });
});
