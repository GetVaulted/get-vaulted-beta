import { describe, expect, it, vi, beforeEach } from "vitest";

const hoisted = vi.hoisted(() => ({
  findFirst: vi.fn(),
  findUniqueListing: vi.fn(),
  findUniqueOrder: vi.fn(),
  findUniqueUser: vi.fn(),
  createListing: vi.fn(),
  createImage: vi.fn(),
  updateListing: vi.fn(),
  updateItem: vi.fn(),
}));

vi.mock("@/services/payments", () => ({
  PAYMENT_PAID: "paid",
}));

import { ensureLiveBuyNowItemCheckoutListingTx } from "@/lib/live-buy-now-checkout-listing";

function mockTx() {
  return {
    liveRoomItem: {
      findFirst: hoisted.findFirst,
      update: hoisted.updateItem,
    },
    listing: {
      findUnique: hoisted.findUniqueListing,
      create: hoisted.createListing,
      update: hoisted.updateListing,
    },
    order: {
      findUnique: hoisted.findUniqueOrder,
    },
    user: {
      findUnique: hoisted.findUniqueUser,
    },
    listingImage: {
      create: hoisted.createImage,
    },
  } as never;
}

describe("ensureLiveBuyNowItemCheckoutListingTx", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reuses an active linked buy_now listing and syncs price", async () => {
    hoisted.findFirst.mockResolvedValue({
      id: "item_1",
      title: "Team lot",
      imageUrl: "https://cdn.example/a.jpg",
      priceUsd: 25,
      listingId: "list_1",
      salesFormat: "buy_now",
      status: "active",
      quantity: 1,
      shippingProfileId: "ship_1",
      liveRoom: { sellerId: "seller_1", category: "Football" },
    });
    hoisted.findUniqueListing.mockResolvedValue({
      id: "list_1",
      status: "active",
      buyingFormat: "buy_now",
      moderationRemovedAt: null,
    });
    hoisted.findUniqueOrder.mockResolvedValue(null);
    hoisted.updateListing.mockResolvedValue({ id: "list_1" });

    const result = await ensureLiveBuyNowItemCheckoutListingTx(mockTx(), {
      liveRoomId: "room_1",
      liveRoomItemId: "item_1",
    });

    expect(result).toEqual({ ok: true, listingId: "list_1" });
    expect(hoisted.updateListing).toHaveBeenCalledWith({
      where: { id: "list_1" },
      data: { priceUsd: 25 },
    });
    expect(hoisted.createListing).not.toHaveBeenCalled();
  });

  it("creates and links a listing when the host lot has no listingId", async () => {
    hoisted.findFirst.mockResolvedValue({
      id: "item_2",
      title: "Locdown card",
      imageUrl: "https://cdn.example/b.jpg",
      priceUsd: 40,
      listingId: null,
      salesFormat: "buy_now",
      status: "queued",
      quantity: 1,
      shippingProfileId: null,
      liveRoom: { sellerId: "seller_1", category: "Football" },
    });
    hoisted.findUniqueUser.mockResolvedValue({ defaultShipFromAddressId: "addr_1" });
    hoisted.createListing.mockResolvedValue({ id: "list_new" });
    hoisted.createImage.mockResolvedValue({ id: "img_1" });
    hoisted.updateItem.mockResolvedValue({ id: "item_2" });

    const result = await ensureLiveBuyNowItemCheckoutListingTx(mockTx(), {
      liveRoomId: "room_1",
      liveRoomItemId: "item_2",
    });

    expect(result).toEqual({ ok: true, listingId: "list_new" });
    expect(hoisted.createListing).toHaveBeenCalled();
    expect(hoisted.createListing.mock.calls[0]![0].data).toMatchObject({
      sellerId: "seller_1",
      title: "Locdown card",
      buyingFormat: "buy_now",
      status: "active",
      priceUsd: 40,
    });
    expect(hoisted.updateItem).toHaveBeenCalledWith({
      where: { id: "item_2" },
      data: { listingId: "list_new" },
    });
  });

  it("mints a new listing when the prior linked listing is already paid", async () => {
    hoisted.findFirst.mockResolvedValue({
      id: "item_3",
      title: "Multi unit",
      imageUrl: "",
      priceUsd: 10,
      listingId: "list_old",
      salesFormat: "buy_now",
      status: "active",
      quantity: 2,
      shippingProfileId: null,
      liveRoom: { sellerId: "seller_1", category: "Other" },
    });
    hoisted.findUniqueListing.mockResolvedValue({
      id: "list_old",
      status: "sold",
      buyingFormat: "buy_now",
      moderationRemovedAt: null,
    });
    hoisted.findUniqueOrder.mockResolvedValue({ paymentStatus: "paid" });
    hoisted.findUniqueUser.mockResolvedValue({ defaultShipFromAddressId: null });
    hoisted.createListing.mockResolvedValue({ id: "list_fresh" });
    hoisted.updateItem.mockResolvedValue({ id: "item_3" });

    const result = await ensureLiveBuyNowItemCheckoutListingTx(mockTx(), {
      liveRoomId: "room_1",
      liveRoomItemId: "item_3",
    });

    expect(result).toEqual({ ok: true, listingId: "list_fresh" });
    expect(hoisted.createListing).toHaveBeenCalled();
  });

  it("rejects host-only lots with no price", async () => {
    hoisted.findFirst.mockResolvedValue({
      id: "item_4",
      title: "No price",
      imageUrl: "",
      priceUsd: null,
      listingId: null,
      salesFormat: "buy_now",
      status: "active",
      quantity: 1,
      shippingProfileId: null,
      liveRoom: { sellerId: "seller_1", category: "Other" },
    });

    const result = await ensureLiveBuyNowItemCheckoutListingTx(mockTx(), {
      liveRoomId: "room_1",
      liveRoomItemId: "item_4",
    });

    expect(result).toEqual({
      ok: false,
      code: "NO_PRICE",
      error: "This item needs a price before checkout.",
    });
  });
});
