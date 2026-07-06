import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createBuyNowCheckoutSession } from "@/services/payments";
import {
  bootstrapIntegrationPrisma,
  resetIntegrationDatabase,
  seedListing,
  seedSellerStripeReady,
  seedUser,
  teardownIntegrationPrisma,
} from "@/test/integration-setup";

// Regression (chaos engineering deep-dive, 2026-07 — "Orphan Checkout Session"): once Stripe hands
// back a payable Checkout Session, the buyer can complete payment on it regardless of what our own
// app does next. The old code put the whole "persist session id + notify" step inside the same
// try/catch that deletes the pending order on ANY failure, so a transient DB/notification error
// *after* a successful `stripe.checkout.sessions.create` deleted the order — leaving a real, payable
// Stripe session with no local order for `checkout.session.completed` to finalize into (a buyer
// could be charged with zero local record). These tests verify the order now survives any failure
// that happens after Stripe has already committed to a session, while still rolling back correctly
// when session creation itself fails.

const stripeHoisted = vi.hoisted(() => ({
  api: {
    checkout: {
      sessions: {
        retrieve: vi.fn().mockResolvedValue({ status: "expired", url: null }),
        create: vi.fn().mockResolvedValue({ id: "cs_orphan_regress", url: "https://checkout.test/orphan" }),
      },
    },
  },
}));

vi.mock("@/lib/stripe", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/stripe")>();
  return {
    ...actual,
    getStripe: () => stripeHoisted.api as unknown as ReturnType<typeof actual.getStripe>,
  };
});

describe("createBuyNowCheckoutSession — orphan checkout session regression (integration)", () => {
  beforeAll(async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_orphan_regress");
    vi.stubEnv("NEXTAUTH_URL", "http://localhost:3000");
    await bootstrapIntegrationPrisma();
  }, 180_000);

  afterAll(async () => {
    await teardownIntegrationPrisma();
    vi.unstubAllEnvs();
  });

  beforeEach(async () => {
    await resetIntegrationDatabase(prisma);
    stripeHoisted.api.checkout.sessions.create.mockClear();
    stripeHoisted.api.checkout.sessions.create.mockResolvedValue({
      id: "cs_orphan_regress",
      url: "https://checkout.test/orphan",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function seedBuyer() {
    const seller = await seedSellerStripeReady(prisma, {
      email: `orphan_s_${Date.now()}_${Math.random()}@test.internal`,
      username: `orphans${Math.random().toString(36).slice(2, 8)}`,
    });
    const buyer = await seedUser(prisma, {
      email: `orphan_b_${Date.now()}_${Math.random()}@test.internal`,
      username: `orphanb${Math.random().toString(36).slice(2, 8)}`,
    });
    const listing = await seedListing(prisma, {
      sellerId: seller.id,
      buyingFormat: "buy_now",
      status: "active",
      priceUsd: 25,
      shippingPriceUsd: 5,
      shippingBaseWeightOz: 4,
      shippingIncrementalWeightOz: 1,
      shippingCategory: "raw_card",
    });
    return { seller, buyer, listing };
  }

  const shipping = {
    shipRecipientName: "B",
    shipAddress: "1 St",
    shipCity: "Austin",
    shipState: "TX",
    shipZip: "78701",
    shipCountry: "US",
  };

  it("keeps the order alive and still returns the payable URL when persisting stripeCheckoutSessionId fails after Stripe already created the session", async () => {
    const { buyer, listing } = await seedBuyer();

    const updateSpy = vi.spyOn(prisma.order, "update").mockRejectedValueOnce(new Error("simulated db blip"));

    const result = await createBuyNowCheckoutSession({ buyerId: buyer.id, listingId: listing.id, shipping });

    updateSpy.mockRestore();

    expect(result.url).toBe("https://checkout.test/orphan");

    const order = await prisma.order.findFirst({ where: { listingId: listing.id } });
    expect(order).not.toBeNull();
    expect(order?.paymentStatus).toBe("pending_payment");
  });

  it("keeps the order alive and still returns the payable URL when the post-session notification fails", async () => {
    const { buyer, listing } = await seedBuyer();

    const notifSpy = vi
      .spyOn(await import("@/lib/notifications"), "createNotification")
      .mockRejectedValueOnce(new Error("simulated notification failure"));

    const result = await createBuyNowCheckoutSession({ buyerId: buyer.id, listingId: listing.id, shipping });

    notifSpy.mockRestore();

    expect(result.url).toBe("https://checkout.test/orphan");
    const order = await prisma.order.findFirst({ where: { listingId: listing.id } });
    expect(order).not.toBeNull();
    // The stripeCheckoutSessionId write happens before the notification call, so it should have
    // persisted even though the notification afterward failed.
    expect(order?.stripeCheckoutSessionId).toBe("cs_orphan_regress");
  });

  it("still rolls back the pending order when Stripe session creation itself fails (no session was ever committed)", async () => {
    const { buyer, listing } = await seedBuyer();
    stripeHoisted.api.checkout.sessions.create.mockRejectedValueOnce(new Error("stripe unreachable"));

    await expect(
      createBuyNowCheckoutSession({ buyerId: buyer.id, listingId: listing.id, shipping }),
    ).rejects.toThrow("stripe unreachable");

    const order = await prisma.order.findFirst({ where: { listingId: listing.id } });
    expect(order).toBeNull();
  });

  it("happy path is unaffected: session id is persisted and the order survives", async () => {
    const { buyer, listing } = await seedBuyer();

    const result = await createBuyNowCheckoutSession({ buyerId: buyer.id, listingId: listing.id, shipping });

    expect(result.url).toBe("https://checkout.test/orphan");
    const order = await prisma.order.findFirst({ where: { listingId: listing.id } });
    expect(order?.stripeCheckoutSessionId).toBe("cs_orphan_regress");
    expect(order?.paymentStatus).toBe("pending_payment");
  });
});
