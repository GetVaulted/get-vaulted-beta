/**
 * Staging green-path validation (API / DB layer).
 *
 * Run when INTEGRATION_DATABASE_URL or DATABASE_URL is set:
 *   npm run staging:validate
 *
 * Mirrors manual steps in:
 *   - web/docs/LIVE_AUCTION_E2E_QA.md (Release status checklist)
 *   - web/docs/orders-fulfillment-qa-checklist.md
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { minNextBidUsd } from "@/lib/auction";
import { resolveLiveAuctionLotBidPhase } from "@/lib/live-auction-lot-phase";
import {
  PAYMENT_EXPIRED,
  PAYMENT_PENDING,
  PAYMENT_PAID,
  processAuctionPaymentExpiries,
} from "@/services/payments";
import {
  bootstrapIntegrationPrisma,
  resetIntegrationDatabase,
  seedBid,
  seedListing,
  seedOrder,
  seedSellerStripeAndShipFrom,
  seedUser,
  teardownIntegrationPrisma,
} from "@/test/integration-setup";

const authHoisted = vi.hoisted(() => ({
  userId: "" as string,
}));

const accountAuthHoisted = vi.hoisted(() => ({
  userId: "" as string,
}));

const sessionHoisted = vi.hoisted(() => ({
  getServerSession: vi.fn(),
}));

vi.mock("next-auth", () => ({
  getServerSession: sessionHoisted.getServerSession,
}));

vi.mock("@/lib/resolve-live-rooms-auth", () => ({
  resolveLiveRoomsUserId: vi.fn(async () => {
    if (!authHoisted.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return { userId: authHoisted.userId };
  }),
  resolveOptionalLiveRoomsUserId: vi.fn(async () => authHoisted.userId || null),
}));

vi.mock("@/lib/resolve-account-auth", () => ({
  resolveAccountUserId: vi.fn(async () => {
    if (!accountAuthHoisted.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return { userId: accountAuthHoisted.userId };
  }),
}));

vi.mock("@/lib/supabase-realtime-broadcast", () => ({
  broadcastRealtimeEvent: vi.fn(),
  broadcastRealtimeEventOnce: vi.fn().mockResolvedValue(undefined),
}));

/** Vitest has no Next request scope; run deferred fanout inline instead of `after()`. */
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: (fn: () => void | Promise<void>) => {
      void Promise.resolve(fn()).catch((err) => {
        console.error("[staging test] after() callback", err);
      });
    },
  };
});

vi.mock("@/lib/realtime-emit-server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/realtime-emit-server")>();
  return {
    ...actual,
    emitBidPlaced: vi.fn(),
    emitBidPlacedAwait: vi.fn(async () => {}),
    emitActiveItemChanged: vi.fn(),
    emitActiveItemChangedAwait: vi.fn(async () => {}),
    emitLiveRoomQueueItemsChanged: vi.fn(),
    emitPurchaseCompleted: vi.fn(),
    emitAuctionStarted: vi.fn(),
    emitAuctionEnded: vi.fn(),
    emitTeamBoardChanged: vi.fn(),
  };
});

vi.mock("@/lib/stripe-charge-order-saved-pm", () => ({
  chargeLiveAuctionWinOrderWithBuyerDefaultSavedCard: vi
    .fn()
    .mockResolvedValue({ outcome: "pending" as const }),
}));

describe("staging green path (live auction + orders fulfillment)", () => {
  let patchRoom: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
  let patchItem: (req: Request, ctx: { params: Promise<{ id: string; itemId: string }> }) => Promise<Response>;
  let postBid: (req: Request, ctx: { params: Promise<{ id: string; itemId: string }> }) => Promise<Response>;
  let getOrders: (req: Request) => Promise<Response>;
  let getSales: (req: Request) => Promise<Response>;
  let patchOrder: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeAll(async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    vi.stubEnv("LIVE_MARKETPLACE_ENABLED", "1");
    await bootstrapIntegrationPrisma();
    patchRoom = (await import("@/app/api/live-rooms/[id]/route")).PATCH;
    patchItem = (await import("@/app/api/live-rooms/[id]/items/[itemId]/route")).PATCH;
    postBid = (await import("@/app/api/live-rooms/[id]/items/[itemId]/bid/route")).POST;
    getOrders = (await import("@/app/api/account/orders/route")).GET;
    getSales = (await import("@/app/api/account/sales/route")).GET;
    patchOrder = (await import("@/app/api/orders/[id]/route")).PATCH;
  }, 180_000);

  afterAll(async () => {
    await teardownIntegrationPrisma();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  beforeEach(async () => {
    await resetIntegrationDatabase(prisma);
    authHoisted.userId = "";
    accountAuthHoisted.userId = "";
  });

  it("live auction + orders fulfillment staging green path", async () => {
    const seller = await seedSellerStripeAndShipFrom(prisma, {
      email: "staging_seller@test.internal",
      username: "stagingSeller",
    });
    const buyerWeb = await seedUser(prisma, {
      email: "staging_buyer_web@test.internal",
      username: "stagingBuyerWeb",
    });
    const buyerMobile = await seedUser(prisma, {
      email: "staging_buyer_mob@test.internal",
      username: "stagingBuyerMob",
    });

    const listing = await seedListing(prisma, {
      sellerId: seller.id,
      buyingFormat: "auction",
      status: "auction_live",
      priceUsd: 10,
      startingBidUsd: 10,
      currentBidUsd: 10,
      shippingPriceUsd: 3,
      auctionEndsAt: new Date(Date.now() + 86_400_000),
    });

    const room = await prisma.liveRoom.create({
      data: {
        sellerId: seller.id,
        title: "Staging validation room",
        roomType: "auction",
        status: "scheduled",
      },
    });

    const item = await prisma.liveRoomItem.create({
      data: {
        liveRoomId: room.id,
        listingId: listing.id,
        title: listing.title,
        status: "queued",
        sortOrder: 0,
        startingBidUsd: 10,
        currentBidUsd: 10,
      },
    });

    // 1. Seller starts room
    authHoisted.userId = seller.id;
    const goLive = await patchRoom(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "start" }),
      }),
      { params: Promise.resolve({ id: room.id }) },
    );
    expect(goLive.status).toBe(200);
    await prisma.liveRoom.update({
      where: { id: room.id },
      data: { streamHealth: "live" },
    });

    authHoisted.userId = seller.id;
    const activate = await patchItem(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "active" }),
      }),
      { params: Promise.resolve({ id: room.id, itemId: item.id }) },
    );
    expect(activate.status).toBe(200);

    const startBid = await patchItem(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "startAuction", auctionDurationSec: 8, clutchTimeEnabled: false }),
      }),
      { params: Promise.resolve({ id: room.id, itemId: item.id }) },
    );
    expect(startBid.status).toBe(200);

    // 4–5. Web + mobile buyers bid (amounts must satisfy minNextBidUsd increments)
    const startHigh = listing.currentBidUsd ?? 10;
    const webBidAmount = minNextBidUsd(startHigh);
    const mobileBidAmount = minNextBidUsd(webBidAmount);

    authHoisted.userId = buyerWeb.id;
    const bidWeb = await postBid(
      new Request("http://localhost", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": "staging-web-bid-1" },
        body: JSON.stringify({ amountUsd: webBidAmount }),
      }),
      { params: Promise.resolve({ id: room.id, itemId: item.id }) },
    );
    expect(bidWeb.status).toBe(200);

    authHoisted.userId = buyerMobile.id;
    const bidMob = await postBid(
      new Request("http://localhost", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": "staging-mob-bid-1" },
        body: JSON.stringify({ amountUsd: mobileBidAmount }),
      }),
      { params: Promise.resolve({ id: room.id, itemId: item.id }) },
    );
    expect(bidMob.status).toBe(200);

    const afterBids = await prisma.liveRoomItem.findUnique({ where: { id: item.id } });
    expect(afterBids?.currentBidUsd).toBe(mobileBidAmount);
    expect(afterBids?.lastHighBidderId).toBe(buyerMobile.id);

    // 7. Timer expires (simulate — no auto-settle)
    await prisma.liveRoomItem.update({
      where: { id: item.id },
      data: { auctionEndsAt: new Date(Date.now() - 10_000) },
    });
    const endedItem = await prisma.liveRoomItem.findUnique({ where: { id: item.id } });
    const phase = resolveLiveAuctionLotBidPhase(
      {
        status: endedItem!.status,
        biddingOpen: endedItem!.biddingOpen,
        auctionEndsAt: endedItem!.auctionEndsAt?.toISOString() ?? null,
      },
      Date.now(),
    );
    expect(phase).toBe("timer_ended_unsettled");

    authHoisted.userId = buyerWeb.id;
    const bidAfterEnd = await postBid(
      new Request("http://localhost", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amountUsd: 25 }),
      }),
      { params: Promise.resolve({ id: room.id, itemId: item.id }) },
    );
    expect(bidAfterEnd.status).toBeGreaterThanOrEqual(400);

    // 10. Host marks sold → order created
    authHoisted.userId = seller.id;
    const markSold = await patchItem(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "sold" }),
      }),
      { params: Promise.resolve({ id: room.id, itemId: item.id }) },
    );
    expect(markSold.status).toBe(200);
    const soldBody = (await markSold.json()) as { ok?: boolean; orderId?: string };
    expect(soldBody.ok).toBe(true);
    expect(soldBody.orderId).toBeTruthy();

    const order = await prisma.order.findUniqueOrThrow({ where: { id: soldBody.orderId! } });
    expect(order.buyerId).toBe(buyerMobile.id);
    expect(order.paymentStatus).toBe(PAYMENT_PENDING);

    // 12. Buyer pays (simulate successful checkout / webhook)
    await prisma.order.update({
      where: { id: order.id },
      data: { paymentStatus: PAYMENT_PAID, status: "paid" },
    });

    // 13. Seller sees sale
    sessionHoisted.getServerSession.mockResolvedValue({ user: { id: seller.id } } as never);
    const salesRes = await getSales(new Request("http://localhost"));
    expect(salesRes.status).toBe(200);
    const salesJson = (await salesRes.json()) as { orders?: { id: string }[] };
    expect(salesJson.orders?.some((o) => o.id === order.id)).toBe(true);

    // --- Orders & fulfillment pass ---
    accountAuthHoisted.userId = buyerMobile.id;
    const ordersRes = await getOrders(new Request("http://localhost"));
    expect(ordersRes.status).toBe(200);
    const ordersJson = (await ordersRes.json()) as { orders?: { id: string; paymentStatus: string }[] };
    const buyerRow = ordersJson.orders?.find((o) => o.id === order.id);
    expect(buyerRow?.paymentStatus).toBe(PAYMENT_PAID);

    // Unpaid order cannot be fulfilled (document current API behavior)
    const unpaidListing = await seedListing(prisma, {
      sellerId: seller.id,
      buyingFormat: "auction",
      status: "awaiting_auction_payment",
      priceUsd: 27,
      startingBidUsd: 27,
      currentBidUsd: 27,
    });
    const unpaid = await seedOrder(prisma, {
      listingId: unpaidListing.id,
      buyerId: buyerWeb.id,
      sellerId: seller.id,
      itemPriceUsd: 27,
      shippingPriceUsd: 3,
      status: "pending",
      paymentStatus: PAYMENT_PENDING,
      paymentDeadlineAt: new Date(Date.now() + 3_600_000),
    });
    sessionHoisted.getServerSession.mockResolvedValue({ user: { id: seller.id } } as never);
    const shipUnpaid = await patchOrder(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ markShipped: true, trackingNumber: "SHOULD-NOT-SHIP" }),
      }),
      { params: Promise.resolve({ id: unpaid.id }) },
    );
    expect(shipUnpaid.status).toBe(403);
    const shipUnpaidBody = (await shipUnpaid.json()) as { error?: string };
    expect(shipUnpaidBody.error).toBe("Order must be paid before fulfillment.");
    const unpaidAfter = await prisma.order.findUnique({ where: { id: unpaid.id } });
    expect(unpaidAfter?.status).not.toBe("shipped");

    // Paid order: mark shipped + tracking
    const shipPaid = await patchOrder(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ markShipped: true, trackingNumber: "1ZSTAGING999" }),
      }),
      { params: Promise.resolve({ id: order.id }) },
    );
    expect(shipPaid.status).toBe(200);
    const shipped = await prisma.order.findUnique({ where: { id: order.id } });
    expect(shipped?.status).toBe("shipped");
    expect(shipped?.trackingNumber).toBe("1ZSTAGING999");

    // 14. Expiry on reload
    const expireListing = await seedListing(prisma, {
      sellerId: seller.id,
      buyingFormat: "auction",
      status: "awaiting_auction_payment",
      priceUsd: 5,
      startingBidUsd: 5,
      currentBidUsd: 12,
    });
    const expireOrder = await seedOrder(prisma, {
      listingId: expireListing.id,
      buyerId: buyerWeb.id,
      sellerId: seller.id,
      itemPriceUsd: 12,
      shippingPriceUsd: 3,
      status: "pending",
      paymentStatus: PAYMENT_PENDING,
      paymentDeadlineAt: new Date(Date.now() - 60_000),
    });
    await processAuctionPaymentExpiries();
    const expired = await prisma.order.findUnique({ where: { id: expireOrder.id } });
    expect(expired?.paymentStatus).toBe(PAYMENT_EXPIRED);

    accountAuthHoisted.userId = buyerWeb.id;
    await getOrders(new Request("http://localhost"));
    const afterReload = await prisma.order.findUnique({ where: { id: expireOrder.id } });
    expect(afterReload?.paymentStatus).toBe(PAYMENT_EXPIRED);
  }, 120_000);
});
