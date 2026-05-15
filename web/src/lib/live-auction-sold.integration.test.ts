import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { settleLiveAuctionItemWhenMarkedSold } from "@/lib/live-auction-item-sold-settle";
import {
  bootstrapIntegrationPrisma,
  resetIntegrationDatabase,
  seedBid,
  seedListing,
  seedSellerStripeReady,
  seedUser,
  teardownIntegrationPrisma,
} from "@/test/integration-setup";

const sessionHoisted = vi.hoisted(() => ({
  getServerSession: vi.fn(),
}));

vi.mock("next-auth", () => ({
  getServerSession: sessionHoisted.getServerSession,
}));

/** Avoid real Supabase Realtime in Vitest (channel subscribe/teardown can recurse / reject after tests end). DB assertions remain real. */
vi.mock("@/lib/supabase-realtime-broadcast", () => ({
  broadcastRealtimeEvent: vi.fn(),
}));

vi.mock("@/lib/stripe-charge-order-saved-pm", () => ({
  chargeLiveAuctionWinOrderWithBuyerDefaultSavedCard: vi.fn().mockResolvedValue({ outcome: "paid" }),
}));

describe("live auction sold settlement (integration)", () => {
  let patchLiveItem: (
    req: Request,
    ctx: { params: Promise<{ id: string; itemId: string }> },
  ) => Promise<Response>;

  beforeAll(async () => {
    await bootstrapIntegrationPrisma();
    const mod = await import("@/app/api/live-rooms/[id]/items/[itemId]/route");
    patchLiveItem = mod.PATCH;
  }, 180_000);

  afterAll(async () => {
    await teardownIntegrationPrisma();
    vi.restoreAllMocks();
  });

  beforeEach(async () => {
    await resetIntegrationDatabase(prisma);
    sessionHoisted.getServerSession.mockReset();
  });

  it("settle throws LIVE_AUCTION_NO_WINNER when unlinked item has no lastHighBidderId", async () => {
    const seller = await seedSellerStripeReady(prisma, { email: "las1_s@test.internal", username: "lasseller1" });
    const room = await prisma.liveRoom.create({
      data: { sellerId: seller.id, title: "A1", roomType: "auction", status: "live" },
    });
    const item = await prisma.liveRoomItem.create({
      data: {
        liveRoomId: room.id,
        listingId: null,
        title: "Orphan lot",
        status: "active",
        currentBidUsd: 25,
        lastHighBidderId: null,
      },
    });

    await expect(
      prisma.$transaction((tx) =>
        settleLiveAuctionItemWhenMarkedSold(tx, { liveRoomId: room.id, liveRoomItemId: item.id }),
      ),
    ).rejects.toThrow("LIVE_AUCTION_NO_WINNER");
  });

  it("PATCH sold returns 409 when unlinked item cannot settle (no winner)", async () => {
    const seller = await seedSellerStripeReady(prisma, { email: "las2_s@test.internal", username: "lasseller2" });
    const room = await prisma.liveRoom.create({
      data: { sellerId: seller.id, title: "A2", roomType: "auction", status: "live" },
    });
    const item = await prisma.liveRoomItem.create({
      data: {
        liveRoomId: room.id,
        listingId: null,
        title: "No bidder",
        status: "active",
        currentBidUsd: 10,
        lastHighBidderId: null,
      },
    });
    sessionHoisted.getServerSession.mockResolvedValue({ user: { id: seller.id, role: "user" } });

    const res = await patchLiveItem(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "sold" }),
      }),
      { params: Promise.resolve({ id: room.id, itemId: item.id }) },
    );
    expect(res.status).toBe(409);
    const fresh = await prisma.liveRoomItem.findUnique({ where: { id: item.id } });
    expect(fresh?.status).not.toBe("sold");
  });

  it("linked listing: settle creates Order and listing awaits payment", async () => {
    const seller = await seedSellerStripeReady(prisma, { email: "las3_s@test.internal", username: "lasseller3" });
    const buyer = await seedUser(prisma, { email: "las3_b@test.internal", username: "lasbuyer3" });
    const room = await prisma.liveRoom.create({
      data: { sellerId: seller.id, title: "A3", roomType: "auction", status: "live" },
    });
    const listing = await seedListing(prisma, {
      sellerId: seller.id,
      buyingFormat: "auction",
      status: "auction_live",
      priceUsd: 10,
      startingBidUsd: 10,
      currentBidUsd: 42,
      shippingPriceUsd: 5,
      auctionEndsAt: new Date(Date.now() + 86_400_000),
    });
    await seedBid(prisma, { listingId: listing.id, bidderId: buyer.id, amountUsd: 42, maxBidUsd: 42 });
    const item = await prisma.liveRoomItem.create({
      data: {
        liveRoomId: room.id,
        listingId: listing.id,
        title: listing.title,
        status: "active",
        currentBidUsd: 42,
      },
    });

    const { orderId } = await prisma.$transaction((tx) =>
      settleLiveAuctionItemWhenMarkedSold(tx, { liveRoomId: room.id, liveRoomItemId: item.id }),
    );

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    expect(order).not.toBeNull();
    expect(order?.buyerId).toBe(buyer.id);
    expect(order?.listingId).toBe(listing.id);
    const listAfter = await prisma.listing.findUnique({ where: { id: listing.id } });
    expect(listAfter?.status).toBe("awaiting_auction_payment");
  });

  it("unlinked item with lastHighBidderId: settle creates synthetic listing, bid, and order", async () => {
    const seller = await seedSellerStripeReady(prisma, { email: "las4_s@test.internal", username: "lasseller4" });
    const buyer = await seedUser(prisma, { email: "las4_b@test.internal", username: "lasbuyer4" });
    const room = await prisma.liveRoom.create({
      data: { sellerId: seller.id, title: "A4", roomType: "auction", status: "live" },
    });
    const item = await prisma.liveRoomItem.create({
      data: {
        liveRoomId: room.id,
        listingId: null,
        title: "Ephemeral lot",
        status: "active",
        currentBidUsd: 55,
        startingBidUsd: 10,
        priceUsd: 10,
        lastHighBidderId: buyer.id,
      },
    });

    const { orderId } = await prisma.$transaction((tx) =>
      settleLiveAuctionItemWhenMarkedSold(tx, { liveRoomId: room.id, liveRoomItemId: item.id }),
    );

    const linked = await prisma.liveRoomItem.findUnique({ where: { id: item.id }, select: { listingId: true } });
    expect(linked?.listingId).toBeTruthy();
    const listing = await prisma.listing.findUniqueOrThrow({ where: { id: linked!.listingId! } });
    expect(listing.title).toContain("Ephemeral");
    expect(listing.sellerId).toBe(seller.id);

    const bids = await prisma.bid.findMany({ where: { listingId: listing.id } });
    expect(bids.length).toBeGreaterThanOrEqual(1);

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    expect(order?.buyerId).toBe(buyer.id);
  });

  it("PATCH sold on auction room persists sold only after Order exists", async () => {
    const seller = await seedSellerStripeReady(prisma, { email: "las5_s@test.internal", username: "lasseller5" });
    const buyer = await seedUser(prisma, { email: "las5_b@test.internal", username: "lasbuyer5" });
    const room = await prisma.liveRoom.create({
      data: { sellerId: seller.id, title: "A5", roomType: "auction", status: "live" },
    });
    const listing = await seedListing(prisma, {
      sellerId: seller.id,
      buyingFormat: "auction",
      status: "auction_live",
      priceUsd: 5,
      startingBidUsd: 5,
      currentBidUsd: 20,
      shippingPriceUsd: 2,
      auctionEndsAt: new Date(Date.now() + 86_400_000),
    });
    await seedBid(prisma, { listingId: listing.id, bidderId: buyer.id, amountUsd: 20, maxBidUsd: 20 });
    const item = await prisma.liveRoomItem.create({
      data: {
        liveRoomId: room.id,
        listingId: listing.id,
        title: listing.title,
        status: "active",
        currentBidUsd: 20,
      },
    });
    sessionHoisted.getServerSession.mockResolvedValue({ user: { id: seller.id, role: "user" } });

    const res = await patchLiveItem(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "sold" }),
      }),
      { params: Promise.resolve({ id: room.id, itemId: item.id }) },
    );
    expect(res.status).toBe(200);

    const soldItem = await prisma.liveRoomItem.findUnique({ where: { id: item.id } });
    expect(soldItem?.status).toBe("sold");
    const ord = await prisma.order.findUnique({ where: { listingId: listing.id } });
    expect(ord).not.toBeNull();
  });
});
