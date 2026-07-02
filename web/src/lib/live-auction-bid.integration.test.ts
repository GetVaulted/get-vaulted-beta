/**
 * Server-authoritative live auction bid pipeline (host lots).
 *
 * Run: INTEGRATION_DATABASE_URL=... npx vitest run src/lib/live-auction-bid.integration.test.ts
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  bootstrapIntegrationPrisma,
  resetIntegrationDatabase,
  seedSellerStripeAndShipFrom,
  seedUser,
  teardownIntegrationPrisma,
} from "@/test/integration-setup";

const authHoisted = vi.hoisted(() => ({ userId: "" as string }));

vi.mock("@/lib/resolve-live-rooms-auth", () => ({
  resolveLiveRoomsUserId: vi.fn(async () => {
    if (!authHoisted.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return { userId: authHoisted.userId };
  }),
  resolveOptionalLiveRoomsUserId: vi.fn(async () => authHoisted.userId || null),
}));

vi.mock("@/lib/supabase-realtime-broadcast", () => ({
  broadcastRealtimeEvent: vi.fn(),
  broadcastRealtimeEventOnce: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: (fn: () => void | Promise<void>) => {
      void Promise.resolve(fn()).catch(console.error);
    },
  };
});

describe("live auction bid pipeline (host lot)", () => {
  let patchRoom: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
  let patchItem: (req: Request, ctx: { params: Promise<{ id: string; itemId: string }> }) => Promise<Response>;
  let postBid: (req: Request, ctx: { params: Promise<{ id: string; itemId: string }> }) => Promise<Response>;

  beforeAll(async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    await bootstrapIntegrationPrisma();
    patchRoom = (await import("@/app/api/live-rooms/[id]/route")).PATCH;
    patchItem = (await import("@/app/api/live-rooms/[id]/items/[itemId]/route")).PATCH;
    postBid = (await import("@/app/api/live-rooms/[id]/items/[itemId]/bid/route")).POST;
  }, 180_000);

  afterAll(async () => {
    await teardownIntegrationPrisma();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  beforeEach(async () => {
    await resetIntegrationDatabase(prisma);
    authHoisted.userId = "";
  });

  async function seedLiveHostLot() {
    const seller = await seedSellerStripeAndShipFrom(prisma, {
      email: "bid_seller@test.internal",
      username: "bidSeller",
    });
    const buyer = await seedUser(prisma, { email: "bid_buyer@test.internal", username: "bidBuyer" });
    const room = await prisma.liveRoom.create({
      data: { sellerId: seller.id, title: "Bid test room", roomType: "auction", status: "scheduled" },
    });
    const item = await prisma.liveRoomItem.create({
      data: {
        liveRoomId: room.id,
        title: "Host lot",
        status: "queued",
        sortOrder: 0,
        startingBidUsd: 10,
        currentBidUsd: 10,
      },
    });
    authHoisted.userId = seller.id;
    await patchRoom(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "start" }),
      }),
      { params: Promise.resolve({ id: room.id }) },
    );
    await prisma.liveRoom.update({
      where: { id: room.id },
      data: { streamHealth: "live" },
    });
    await patchItem(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "active" }),
      }),
      { params: Promise.resolve({ id: room.id, itemId: item.id }) },
    );
    await patchItem(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "startAuction", auctionDurationSec: 30, clutchTimeEnabled: false }),
      }),
      { params: Promise.resolve({ id: room.id, itemId: item.id }) },
    );
    return { seller, buyer, room, item };
  }

  it("rejects startAuction when the room is live but stream is offline", async () => {
    const seller = await seedSellerStripeAndShipFrom(prisma, {
      email: "bid_seller_offline@test.internal",
      username: "bidSellerOffline",
    });
    const room = await prisma.liveRoom.create({
      data: { sellerId: seller.id, title: "Offline stream room", roomType: "auction", status: "scheduled" },
    });
    const item = await prisma.liveRoomItem.create({
      data: {
        liveRoomId: room.id,
        title: "Host lot",
        status: "queued",
        sortOrder: 0,
        startingBidUsd: 10,
        currentBidUsd: 10,
      },
    });
    authHoisted.userId = seller.id;
    await patchRoom(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "start" }),
      }),
      { params: Promise.resolve({ id: room.id }) },
    );
    await patchItem(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "active" }),
      }),
      { params: Promise.resolve({ id: room.id, itemId: item.id }) },
    );
    const startRes = await patchItem(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "startAuction", auctionDurationSec: 30, clutchTimeEnabled: false }),
      }),
      { params: Promise.resolve({ id: room.id, itemId: item.id }) },
    );
    expect(startRes.status).toBe(409);
    const body = (await startRes.json()) as { error?: string };
    expect(body.error).toMatch(/broadcast/i);
  });

  it("accepts bid, writes LiveRoomBid + LiveAuctionEvent, sets server leader", async () => {
    const { buyer, room, item } = await seedLiveHostLot();
    const amount = 10;
    authHoisted.userId = buyer.id;
    const res = await postBid(
      new Request("http://localhost", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": "host-bid-1" },
        body: JSON.stringify({ amountUsd: amount }),
      }),
      { params: Promise.resolve({ id: room.id, itemId: item.id }) },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { auctionSeq?: number; item?: { lastHighBidderId?: string } };
    expect(body.auctionSeq).toBe(1);
    expect(body.item?.lastHighBidderId).toBe(buyer.id);

    const lot = await prisma.liveRoomItem.findUnique({ where: { id: item.id } });
    expect(lot?.currentBidUsd).toBe(amount);
    expect(lot?.lastHighBidderId).toBe(buyer.id);

    const bids = await prisma.liveRoomBid.findMany({ where: { liveRoomItemId: item.id } });
    expect(bids).toHaveLength(1);
    expect(bids[0]?.amountUsd).toBe(amount);
    expect(bids[0]?.auctionEventSeq).toBe(1);
    expect(bids[0]?.acceptedAt).toBeInstanceOf(Date);

    const events = await prisma.liveAuctionEvent.findMany({ where: { liveRoomId: room.id } });
    expect(events).toHaveLength(1);
    expect(events[0]?.eventType).toBe("bid_placed");
  });

  it("rejects low bid and late bid after window ends", async () => {
    const { buyer, room, item } = await seedLiveHostLot();
    authHoisted.userId = buyer.id;

    const low = await postBid(
      new Request("http://localhost", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amountUsd: 5 }),
      }),
      { params: Promise.resolve({ id: room.id, itemId: item.id }) },
    );
    expect(low.status).toBe(400);

    await prisma.liveRoomItem.update({
      where: { id: item.id },
      data: { auctionEndsAt: new Date(Date.now() - 1000) },
    });

    const late = await postBid(
      new Request("http://localhost", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amountUsd: 10 }),
      }),
      { params: Promise.resolve({ id: room.id, itemId: item.id }) },
    );
    expect(late.status).toBe(409);
    const lateBody = (await late.json()) as { error?: string };
    expect(lateBody.error).toMatch(/ended/i);
  });

  it("replays idempotent bid POST", async () => {
    const { buyer, room, item } = await seedLiveHostLot();
    const amount = 10;
    authHoisted.userId = buyer.id;
    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": "replay-key" },
      body: JSON.stringify({ amountUsd: amount }),
    });
    const ctx = { params: Promise.resolve({ id: room.id, itemId: item.id }) };
    const first = await postBid(req, ctx);
    const second = await postBid(req, ctx);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const bids = await prisma.liveRoomBid.findMany({ where: { liveRoomItemId: item.id } });
    expect(bids).toHaveLength(1);
  });
});
