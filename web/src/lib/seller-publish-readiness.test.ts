import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSellerPublishListingIssues } from "@/lib/seller-publish-readiness";

const validProfile = {
  shippingBaseWeightOz: 8,
  shippingIncrementalWeightOz: 2,
  shippingCategory: "standard",
};

type Db = Parameters<typeof getSellerPublishListingIssues>[0];

function dbWithUser(user: Record<string, unknown> | null): Db {
  return { user: { findUnique: vi.fn().mockResolvedValue(user) } } as unknown as Db;
}

describe("getSellerPublishListingIssues", () => {
  beforeEach(() => {
    // Isolate the ship-from check: Stripe unset (skips onboarding branch entirely),
    // Shippo "configured" so its issue never shows up alongside the one under test.
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    vi.stubEnv("SHIPPO_API_TOKEN", "shippo_test_token_1234567890");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("does not flag ship-from as incomplete when phone lives only on the default Address relation", async () => {
    // Regression test: the seller saved ship-from through the normal flow (PATCH
    // /api/account/seller), which stores phone on the Address row, not as a flat
    // User.shipFromPhone (that column doesn't exist). The publish query must select
    // defaultShipFromAddress.phone or this always reports the address as incomplete.
    const db = dbWithUser({
      stripeAccountId: null,
      stripeOnboardingComplete: false,
      defaultShipFromAddressId: "addr_1",
      shipFromName: null,
      shipFromStreet: null,
      shipFromCity: null,
      shipFromState: null,
      shipFromZip: null,
      shipFromCountry: null,
      defaultShipFromAddress: {
        line1: "1 Main St",
        city: "Austin",
        state: "TX",
        postalCode: "78701",
        country: "US",
        phone: "5125551234",
      },
    });

    const issues = await getSellerPublishListingIssues(db, "seller_1", validProfile);

    expect(issues).not.toContain("Add a complete ship-from address under Account → Seller.");
  });

  it("still flags ship-from as incomplete when no phone exists anywhere", async () => {
    const db = dbWithUser({
      stripeAccountId: null,
      stripeOnboardingComplete: false,
      defaultShipFromAddressId: "addr_1",
      shipFromName: null,
      shipFromStreet: null,
      shipFromCity: null,
      shipFromState: null,
      shipFromZip: null,
      shipFromCountry: null,
      defaultShipFromAddress: {
        line1: "1 Main St",
        city: "Austin",
        state: "TX",
        postalCode: "78701",
        country: "US",
        phone: null,
      },
    });

    const issues = await getSellerPublishListingIssues(db, "seller_1", validProfile);

    expect(issues).toContain("Add a complete ship-from address under Account → Seller.");
  });

  it("still flags ship-from as incomplete when the address itself is missing", async () => {
    const db = dbWithUser({
      stripeAccountId: null,
      stripeOnboardingComplete: false,
      defaultShipFromAddressId: null,
      shipFromName: null,
      shipFromStreet: null,
      shipFromCity: null,
      shipFromState: null,
      shipFromZip: null,
      shipFromCountry: null,
      defaultShipFromAddress: null,
    });

    const issues = await getSellerPublishListingIssues(db, "seller_1", validProfile);

    expect(issues).toContain("Add a complete ship-from address under Account → Seller.");
  });

  it("accepts a complete ship-from address via the legacy flat User fields", async () => {
    const db = dbWithUser({
      stripeAccountId: null,
      stripeOnboardingComplete: false,
      defaultShipFromAddressId: null,
      shipFromName: "Seller Shop",
      shipFromStreet: "1 Main St",
      shipFromCity: "Austin",
      shipFromState: "TX",
      shipFromZip: "78701",
      shipFromCountry: "US",
      shipFromPhone: "5125551234",
      defaultShipFromAddress: null,
    });

    const issues = await getSellerPublishListingIssues(db, "seller_1", validProfile);

    expect(issues).not.toContain("Add a complete ship-from address under Account → Seller.");
  });

  it("flags an invalid listing shipping profile independently of ship-from state", async () => {
    const db = dbWithUser({
      stripeAccountId: null,
      stripeOnboardingComplete: false,
      defaultShipFromAddressId: "addr_1",
      shipFromName: null,
      shipFromStreet: null,
      shipFromCity: null,
      shipFromState: null,
      shipFromZip: null,
      shipFromCountry: null,
      defaultShipFromAddress: {
        line1: "1 Main St",
        city: "Austin",
        state: "TX",
        postalCode: "78701",
        country: "US",
        phone: "5125551234",
      },
    });

    const issues = await getSellerPublishListingIssues(db, "seller_1", {
      shippingBaseWeightOz: 0,
      shippingIncrementalWeightOz: 2,
      shippingCategory: "",
    });

    expect(issues).toContain(
      "Set a valid listing shipping profile (base weight, incremental weight, and shipping category).",
    );
    expect(issues).not.toContain("Add a complete ship-from address under Account → Seller.");
  });

  it("returns a not-found issue when the seller row is missing", async () => {
    const db = dbWithUser(null);

    const issues = await getSellerPublishListingIssues(db, "missing_seller", validProfile);

    expect(issues).toEqual(["Seller account not found."]);
  });
});
