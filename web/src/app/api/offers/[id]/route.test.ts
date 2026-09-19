import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/resolve-listings-auth", () => ({
  resolveListingsUserId: vi.fn().mockResolvedValue({ userId: "seller_1" }),
}));

const createOrderFromAcceptedOffer = vi.hoisted(() => vi.fn().mockResolvedValue({ orderId: "ord_1" }));
const declineOtherOpenOffersOnListing = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("@/lib/offer-fulfillment", () => ({
  createOrderFromAcceptedOffer,
  declineOtherOpenOffersOnListing,
  loadBuyerShipToForOffer: vi.fn().mockResolvedValue(null),
}));

const createNotification = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("@/lib/notifications", () => ({ createNotification }));

const prismaMock = vi.hoisted(() => ({
  offer: {
    findUnique: vi.fn(),
    updateMany: vi.fn(),
  },
  order: {
    findUnique: vi.fn().mockResolvedValue(null),
  },
  address: {
    findFirst: vi.fn().mockResolvedValue(null),
  },
  $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prismaMock)),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { resolveListingsUserId } from "@/lib/resolve-listings-auth";
import { PATCH } from "@/app/api/offers/[id]/route";

function buildRequest(body: unknown) {
  return new Request("http://localhost/api/offers/offer_1", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

const baseOffer = {
  id: "offer_1",
  status: "pending",
  buyerId: "buyer_1",
  sellerId: "seller_1",
  amountUsd: 100,
  counterAmountUsd: null,
  listing: {
    id: "lst_1",
    title: "Vintage Card",
    sellerId: "seller_1",
    status: "active",
    shippingPriceUsd: 10,
    moderationRemovedAt: null,
  },
};

describe("PATCH /api/offers/[id] — atomic compare-and-swap on state transitions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveListingsUserId).mockResolvedValue({ userId: "seller_1" });
    prismaMock.offer.findUnique.mockResolvedValue(baseOffer);
    prismaMock.order.findUnique.mockResolvedValue(null);
  });

  // Regression (chaos audit): a concurrent second request (double-click, or two different offers
  // on the same listing) must not silently clobber the first request's outcome.
  it("regression: rejects accept with 409 when the offer was already resolved by a concurrent request", async () => {
    prismaMock.offer.updateMany.mockResolvedValue({ count: 0 });

    const res = await PATCH(buildRequest({ action: "accept" }), { params: Promise.resolve({ id: "offer_1" }) });
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error).toMatch(/already resolved/i);
    expect(createOrderFromAcceptedOffer).not.toHaveBeenCalled();
  });

  it("accepts normally and creates the order when the compare-and-swap claim succeeds", async () => {
    prismaMock.offer.updateMany.mockResolvedValue({ count: 1 });

    const res = await PATCH(buildRequest({ action: "accept" }), { params: Promise.resolve({ id: "offer_1" }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.orderCreated).toBe(true);
    expect(prismaMock.offer.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "offer_1", status: "pending" } }),
    );
    expect(createOrderFromAcceptedOffer).toHaveBeenCalledTimes(1);
  });

  it("regression: rejects decline with 409 when the offer was already resolved by a concurrent request", async () => {
    prismaMock.offer.updateMany.mockResolvedValue({ count: 0 });

    const res = await PATCH(buildRequest({ action: "decline" }), { params: Promise.resolve({ id: "offer_1" }) });
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error).toMatch(/already resolved/i);
  });

  it("regression: rejects counter with 409 when the offer was already resolved by a concurrent request", async () => {
    prismaMock.offer.updateMany.mockResolvedValue({ count: 0 });

    const res = await PATCH(buildRequest({ action: "counter", counterAmountUsd: 90 }), {
      params: Promise.resolve({ id: "offer_1" }),
    });
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error).toMatch(/already resolved/i);
  });

  it("regression: rejects accept_counter with 409 when a concurrent request already resolved the counter", async () => {
    vi.mocked(resolveListingsUserId).mockResolvedValue({ userId: "buyer_1" });
    prismaMock.offer.findUnique.mockResolvedValue({ ...baseOffer, status: "countered", counterAmountUsd: 90 });
    prismaMock.offer.updateMany.mockResolvedValue({ count: 0 });

    const res = await PATCH(buildRequest({ action: "accept_counter" }), {
      params: Promise.resolve({ id: "offer_1" }),
    });
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error).toMatch(/already resolved/i);
    expect(createOrderFromAcceptedOffer).not.toHaveBeenCalled();
  });

  it("regression: rejects decline_counter with 409 when a concurrent request already resolved the counter", async () => {
    vi.mocked(resolveListingsUserId).mockResolvedValue({ userId: "buyer_1" });
    prismaMock.offer.findUnique.mockResolvedValue({ ...baseOffer, status: "countered", counterAmountUsd: 90 });
    prismaMock.offer.updateMany.mockResolvedValue({ count: 0 });

    const res = await PATCH(buildRequest({ action: "decline_counter" }), {
      params: Promise.resolve({ id: "offer_1" }),
    });
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error).toMatch(/already resolved/i);
  });

  // Regression: sellers manage offers in the listing studio, not the buyer-facing
  // "/account/offers" page — the notification must deep-link somewhere the seller can act on it.
  it("links the counter-declined notification to the seller's listing studio with the offer id", async () => {
    vi.mocked(resolveListingsUserId).mockResolvedValue({ userId: "buyer_1" });
    prismaMock.offer.findUnique.mockResolvedValue({ ...baseOffer, status: "countered", counterAmountUsd: 90 });
    prismaMock.offer.updateMany.mockResolvedValue({ count: 1 });

    const res = await PATCH(buildRequest({ action: "decline_counter" }), {
      params: Promise.resolve({ id: "offer_1" }),
    });

    expect(res.status).toBe(200);
    expect(createNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: "seller_1",
        href: "/seller/listings/lst_1?offerId=offer_1",
      }),
    );
  });
});
