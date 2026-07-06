import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/resolve-listings-auth", () => ({
  resolveListingsUserId: vi.fn().mockResolvedValue({ userId: "buyer_1" }),
}));

vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn().mockResolvedValue(undefined) }));

vi.mock("@/lib/marketplace/commerce-guards", () => ({
  assertMakeOfferAllowed: vi.fn(),
  CommerceGuardError: class CommerceGuardError extends Error {},
  commerceGuardErrorToHttp: vi.fn(),
  loadListingCommerceContext: vi.fn().mockResolvedValue({ listing: { id: "lst_1" } }),
}));

const prismaMock = vi.hoisted(() => ({
  listing: {
    findUnique: vi.fn(),
  },
  order: {
    findUnique: vi.fn().mockResolvedValue(null),
  },
  offer: {
    findFirst: vi.fn().mockResolvedValue(null),
    create: vi.fn(),
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { createNotification } from "@/lib/notifications";
import { POST } from "@/app/api/offers/route";

function buildRequest(body: unknown) {
  return new Request("http://localhost/api/offers", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const baseListing = {
  id: "lst_1",
  title: "Vintage Card",
  sellerId: "seller_1",
  minimumOfferUsd: null,
};

describe("POST /api/offers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.listing.findUnique.mockResolvedValue(baseListing);
    prismaMock.order.findUnique.mockResolvedValue(null);
    prismaMock.offer.findFirst.mockResolvedValue(null);
  });

  it("rejects a non-positive amount", async () => {
    const res = await POST(buildRequest({ listingId: "lst_1", amountUsd: 0 }));
    expect(res.status).toBe(400);
  });

  // Regression: "200.999999999999999999" (or any excess precision) must never be persisted
  // verbatim — the server is the source of truth and always normalizes to 2 decimal places.
  it("rounds an over-precise amount to 2 decimal places before persisting", async () => {
    prismaMock.offer.create.mockResolvedValue({
      id: "offer_1",
      status: "pending",
      amountUsd: 200.99,
      createdAt: new Date().toISOString(),
    });

    const res = await POST(buildRequest({ listingId: "lst_1", amountUsd: 200.999999999999 }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(prismaMock.offer.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ amountUsd: 201 }) }),
    );
    expect(json.offer.amountUsd).toBe(200.99);
  });

  it("rounds a slightly-over amount down/up to the nearest cent rather than truncating", async () => {
    prismaMock.offer.create.mockResolvedValue({
      id: "offer_2",
      status: "pending",
      amountUsd: 45.13,
      createdAt: new Date().toISOString(),
    });

    await POST(buildRequest({ listingId: "lst_1", amountUsd: 45.126 }));

    expect(prismaMock.offer.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ amountUsd: 45.13 }) }),
    );
  });

  // Regression: sellers manage received offers in the listing studio, not the buyer-facing
  // "/account/offers" page — the notification must deep-link somewhere the seller can act on it.
  it("links the new-offer notification to the seller's listing studio with the offer id", async () => {
    prismaMock.offer.create.mockResolvedValue({
      id: "offer_42",
      status: "pending",
      amountUsd: 100,
      createdAt: new Date().toISOString(),
    });

    await POST(buildRequest({ listingId: "lst_1", amountUsd: 100 }));

    expect(createNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: "seller_1",
        href: "/seller/listings/lst_1?offerId=offer_42",
      }),
    );
  });
});
