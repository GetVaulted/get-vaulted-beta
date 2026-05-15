import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { getSellerLiveReadiness, isLiveAlternateCheckoutSellerRequired } from "@/services/seller/live-show-readiness";
import {
  bootstrapIntegrationPrisma,
  resetIntegrationDatabase,
  seedCompleteShipFrom,
  seedListing,
  seedSellerStripeAndShipFrom,
  seedSellerStripeReady,
  seedUser,
  teardownIntegrationPrisma,
} from "@/test/integration-setup";

const LONG_STRIPE_KEY = "sk_test_12345678901234567890123456789012";
const SHIPPO_TOKEN = "shippo_test_integration_token_long_enough";

describe("getSellerLiveReadiness (integration)", () => {
  beforeAll(async () => {
    await bootstrapIntegrationPrisma();
  }, 180_000);

  afterAll(async () => {
    await teardownIntegrationPrisma();
    vi.unstubAllEnvs();
  });

  beforeEach(async () => {
    await resetIntegrationDatabase(prisma);
    vi.unstubAllEnvs();
    vi.stubEnv("STRIPE_SECRET_KEY", LONG_STRIPE_KEY);
    vi.stubEnv("SHIPPO_API_TOKEN", SHIPPO_TOKEN);
  });

  it("blocks when Stripe is required but seller has no Connect account", async () => {
    const seller = await seedUser(prisma, {
      email: "s1@test.com",
      username: "seller1",
      stripeAccountId: null,
      stripeOnboardingComplete: false,
      shipFrom: seedCompleteShipFrom,
    });
    await seedListing(prisma, {
      sellerId: seller.id,
      buyingFormat: "auction",
      status: "active",
      shippingBaseWeightOz: 4,
      shippingIncrementalWeightOz: 1,
    });

    const r = await getSellerLiveReadiness(seller.id);
    expect(r.canGoLive).toBe(false);
    expect(r.issues.some((m) => /Stripe/i.test(m))).toBe(true);
    expect(r.checks.hasStripeAccount).toBe(false);
  });

  it("blocks when Shippo is configured but ship-from address is incomplete", async () => {
    const seller = await seedUser(prisma, {
      email: "s2@test.com",
      username: "seller2",
      stripeAccountId: "acct_test_x",
      stripeOnboardingComplete: true,
      shipFrom: { shipFromStreet: "1 Main", shipFromCity: undefined, shipFromState: "TX", shipFromZip: "78701", shipFromCountry: "US" },
    });
    await seedListing(prisma, {
      sellerId: seller.id,
      buyingFormat: "buy_now",
      status: "active",
    });

    const r = await getSellerLiveReadiness(seller.id);
    expect(r.canGoLive).toBe(false);
    expect(r.issues.some((m) => /ship-from/i.test(m))).toBe(true);
    expect(r.checks.hasShipFromAddress).toBe(false);
  });

  it("blocks when there is no active listing with a valid shipping profile", async () => {
    const seller = await seedSellerStripeAndShipFrom(prisma, {
      email: "s3@test.com",
      username: "seller3",
    });
    await seedListing(prisma, {
      sellerId: seller.id,
      buyingFormat: "buy_now",
      status: "draft",
      shippingBaseWeightOz: 4,
    });

    const r = await getSellerLiveReadiness(seller.id);
    expect(r.canGoLive).toBe(false);
    expect(r.issues.some((m) => /active listing/i.test(m))).toBe(true);
    expect(r.checks.hasAtLeastOneListingWithShippingProfile).toBe(false);
  });

  it("returns canGoLive when seller meets Stripe, Shippo, ship-from, and listing requirements", async () => {
    const seller = await seedSellerStripeAndShipFrom(prisma, {
      email: "s4@test.com",
      username: "seller4",
    });
    await seedListing(prisma, {
      sellerId: seller.id,
      buyingFormat: "auction",
      status: "active",
      shippingBaseWeightOz: 4,
      shippingIncrementalWeightOz: 1,
      shippingCategory: "slab",
    });

    const r = await getSellerLiveReadiness(seller.id);
    expect(r.canGoLive).toBe(true);
    expect(r.issues).toHaveLength(0);
    expect(r.checks.hasStripeAccount).toBe(true);
    expect(r.checks.stripeChargesEnabled).toBe(true);
    expect(r.checks.hasShippoConfigured).toBe(true);
    expect(r.checks.hasShipFromAddress).toBe(true);
    expect(r.checks.hasAtLeastOneListingWithShippingProfile).toBe(true);
  });

  it("blocks when live alternate checkout is required but provider seller id is missing", async () => {
    vi.stubEnv("ESCROW_ENABLED", "true");
    vi.stubEnv("ESCROW_PROVIDER", "trustap");
    vi.stubEnv("TRUSTAP_API_KEY", "k");
    vi.stubEnv("TRUSTAP_API_BASE_URL", "https://api.trustap.test");
    vi.stubEnv("TRUSTAP_USE_STUB_RESPONSE", "0");

    expect(isLiveAlternateCheckoutSellerRequired()).toBe(true);

    const seller = await seedUser(prisma, {
      email: "s5@test.com",
      username: "seller5",
      stripeAccountId: "acct_test_escrow",
      stripeOnboardingComplete: true,
      shipFrom: seedCompleteShipFrom,
      trustapUserId: null,
    });
    await seedListing(prisma, {
      sellerId: seller.id,
      buyingFormat: "buy_now",
      status: "active",
    });

    const r = await getSellerLiveReadiness(seller.id);
    expect(r.canGoLive).toBe(false);
    expect(r.issues.some((m) => /high-value checkout seller setup/i.test(m))).toBe(true);
    expect(r.checks.alternateCheckoutSellerReady).toBe(false);
  });

  it("does not require linked provider seller id when stub mode is on", async () => {
    vi.stubEnv("ESCROW_ENABLED", "true");
    vi.stubEnv("ESCROW_PROVIDER", "trustap");
    vi.stubEnv("TRUSTAP_API_KEY", "k");
    vi.stubEnv("TRUSTAP_API_BASE_URL", "https://api.trustap.test");
    vi.stubEnv("TRUSTAP_USE_STUB_RESPONSE", "1");

    const seller = await seedUser(prisma, {
      email: "s6@test.com",
      username: "seller6",
      stripeAccountId: "acct_test_stub",
      stripeOnboardingComplete: true,
      shipFrom: seedCompleteShipFrom,
      trustapUserId: null,
    });
    await seedListing(prisma, {
      sellerId: seller.id,
      buyingFormat: "buy_now",
      status: "active",
    });

    const r = await getSellerLiveReadiness(seller.id);
    expect(r.canGoLive).toBe(true);
    expect(r.checks.alternateCheckoutSellerReady).toBe(true);
  });

  it("allows live when seller has provider seller id linked (non-stub)", async () => {
    vi.stubEnv("ESCROW_ENABLED", "true");
    vi.stubEnv("ESCROW_PROVIDER", "trustap");
    vi.stubEnv("TRUSTAP_API_KEY", "k");
    vi.stubEnv("TRUSTAP_API_BASE_URL", "https://api.trustap.test");
    vi.stubEnv("TRUSTAP_USE_STUB_RESPONSE", "0");

    const seller = await seedSellerStripeReady(prisma, {
      email: "s7@test.com",
      username: "seller7",
      shipFrom: seedCompleteShipFrom,
    });
    await seedListing(prisma, {
      sellerId: seller.id,
      buyingFormat: "buy_now",
      status: "active",
    });

    const r = await getSellerLiveReadiness(seller.id);
    expect(r.canGoLive).toBe(true);
    expect(r.checks.alternateCheckoutSellerReady).toBe(true);
  });
});
