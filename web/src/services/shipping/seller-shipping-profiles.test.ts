import { describe, expect, it, vi } from "vitest";
import {
  getActiveSellerShippingProfiles,
  SELLER_SHIPPING_PROFILE_SEEDS,
} from "@/services/shipping/seller-shipping-profiles";

/**
 * Regression coverage for the Sept 2026 fix: getActiveSellerShippingProfiles used to call
 * seedSellerShippingProfiles (16 sequential upserts) on every single call, even for a seller
 * who already had every seed profile. That ran on every live room page load/poll and was a
 * major source of database connection pressure (Sentry flagged it as an N+1 query pattern on
 * GET /api/live-rooms/[id]), and it silently overwrote any customization a seller made to their
 * profile via PATCH /api/account/seller/shipping-profiles.
 */
function fakeProfileRow(sourceSlug: string, overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: `profile-${sourceSlug}`,
    sellerId: "seller-1",
    sourceSlug,
    name: `Seed for ${sourceSlug}`,
    defaultWeightOz: 1,
    defaultLengthIn: 1,
    defaultWidthIn: 1,
    defaultHeightIn: 1,
    packageType: "poly_mailer",
    bundleGroup: "cards",
    incrementalWeightOz: null,
    maxUnitsPerParcel: null,
    requiresSeparatePackage: false,
    canJoinBuyerShowShipment: true,
    carrierPreference: "best_rate",
    defaultServicePreference: null,
    isDefault: false,
    archivedAt: null,
    ...overrides,
  };
}

function makeFakeDb(existingRows: ReturnType<typeof fakeProfileRow>[]) {
  const upsert = vi.fn().mockResolvedValue(undefined);
  const findMany = vi.fn().mockResolvedValue(existingRows);
  return {
    db: { sellerShippingProfile: { findMany, upsert } } as unknown as Parameters<
      typeof getActiveSellerShippingProfiles
    >[1],
    findMany,
    upsert,
  };
}

describe("getActiveSellerShippingProfiles", () => {
  it("does not reseed (zero upserts) once a seller already has every seed profile", async () => {
    const existing = SELLER_SHIPPING_PROFILE_SEEDS.map((seed) => fakeProfileRow(seed.sourceSlug));
    const { db, findMany, upsert } = makeFakeDb(existing);

    const result = await getActiveSellerShippingProfiles("seller-1", db);

    expect(upsert).not.toHaveBeenCalled();
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(result).toBe(existing);
  });

  it("does not clobber a seller's customized profile once fully seeded", async () => {
    // Seller previously customized their "live_break_spot" weight via the account settings PATCH.
    // Before this fix, every call here re-ran the seed upsert and reset it back to the default.
    const existing = SELLER_SHIPPING_PROFILE_SEEDS.map((seed) =>
      fakeProfileRow(seed.sourceSlug, seed.sourceSlug === "live_break_spot" ? { defaultWeightOz: 9.5 } : {}),
    );
    const { db, upsert } = makeFakeDb(existing);

    const result = await getActiveSellerShippingProfiles("seller-1", db);

    expect(upsert).not.toHaveBeenCalled();
    expect(result.find((p) => p.sourceSlug === "live_break_spot")?.defaultWeightOz).toBe(9.5);
  });

  it("still seeds a brand-new seller with no profiles yet", async () => {
    const { db, findMany, upsert } = makeFakeDb([]);

    await getActiveSellerShippingProfiles("seller-1", db);

    expect(upsert).toHaveBeenCalledTimes(SELLER_SHIPPING_PROFILE_SEEDS.length);
    // Called once to check what exists, then again after seeding to return the fresh rows.
    expect(findMany).toHaveBeenCalledTimes(2);
  });

  it("backfills only the missing seed rows when a new seed type is added later", async () => {
    // Seller already has all but one seed slug (simulates a seed type added to the code after
    // this seller signed up). Should still fall back to the full seed pass to backfill it.
    const existing = SELLER_SHIPPING_PROFILE_SEEDS.slice(1).map((seed) => fakeProfileRow(seed.sourceSlug));
    const { db, upsert } = makeFakeDb(existing);

    await getActiveSellerShippingProfiles("seller-1", db);

    expect(upsert).toHaveBeenCalledTimes(SELLER_SHIPPING_PROFILE_SEEDS.length);
  });
});
