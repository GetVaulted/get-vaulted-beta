import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  findMany: vi.fn(),
  findUnique: vi.fn(),
  findFirst: vi.fn(),
  layawayFindFirst: vi.fn(),
  orderFindUnique: vi.fn(),
  tradeOfferCreate: vi.fn(),
  tradeOfferItemCreateMany: vi.fn(),
  tradeOfferEventCreate: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...actual,
    getServerSessionSafe: vi.fn(),
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    listing: { findMany: hoisted.findMany, findUnique: hoisted.findUnique },
    layaway: { findFirst: hoisted.layawayFindFirst },
    order: { findUnique: hoisted.orderFindUnique },
    tradeOffer: { findFirst: hoisted.findFirst },
    user: { findUnique: vi.fn().mockResolvedValue({ username: "sender" }) },
    $transaction: hoisted.transaction,
  },
}));

vi.mock("@/lib/resolve-listings-auth", () => ({
  resolveListingsUserId: vi.fn(),
}));

vi.mock("@/lib/trade-offer-notifications", () => ({
  notifyTradeOfferCreated: vi.fn().mockResolvedValue(undefined),
}));

import { notifyTradeOfferCreated } from "@/lib/trade-offer-notifications";
import { resolveListingsUserId } from "@/lib/resolve-listings-auth";
import { POST } from "@/app/api/trade/offers/route";
import { __resetRateLimitsForTests } from "@/lib/request-rate-limit";

function buildReq(body: unknown) {
  return new Request("http://localhost/api/trade/offers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

type MockListingRow = {
  id: string;
  sellerId: string;
  status: string;
  acceptTradeOffers?: boolean;
  [key: string]: unknown;
};

function mockListingRows(rows: MockListingRow[]) {
  hoisted.findMany.mockResolvedValue(rows);
  const byId = new Map(rows.map((row) => [row.id, row]));
  hoisted.findUnique.mockImplementation(async (args: { where: { id: string } }) => {
    const row = byId.get(args.where.id);
    if (!row) return null;
    return {
      id: row.id,
      sellerId: row.sellerId,
      status: row.status,
      buyingFormat: "buy_now",
      moderationRemovedAt: null,
      allowOffers: true,
      acceptTradeOffers: row.acceptTradeOffers ?? true,
      allowLayaway: false,
    };
  });
}

describe("POST /api/trade/offers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetRateLimitsForTests();
    vi.mocked(resolveListingsUserId).mockResolvedValue({ userId: "user_sender" });
    hoisted.transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) =>
      cb({
        tradeOffer: { create: hoisted.tradeOfferCreate },
        tradeOfferItem: { createMany: hoisted.tradeOfferItemCreateMany },
        tradeOfferEvent: { create: hoisted.tradeOfferEventCreate },
      }),
    );
    hoisted.tradeOfferCreate.mockResolvedValue({ id: "trade_1" });
    hoisted.tradeOfferItemCreateMany.mockResolvedValue({ count: 2 });
    hoisted.tradeOfferEventCreate.mockResolvedValue({ id: "evt_1" });
    hoisted.findFirst.mockResolvedValue(null);
    hoisted.layawayFindFirst.mockResolvedValue(null);
    hoisted.orderFindUnique.mockResolvedValue(null);
  });

  it("creates offer + snapshots + created event", async () => {
    mockListingRows([
      {
        id: "req_1",
        title: "Requested",
        category: "Trading Cards",
        condition: "PSA 10",
        priceUsd: 500,
        status: "active",
        sellerId: "user_receiver",
        acceptTradeOffers: true,
        images: [{ url: "https://img/req.jpg", sortOrder: 0 }],
        seller: { username: "receiver" },
      },
      {
        id: "off_1",
        title: "Offered",
        category: "Trading Cards",
        condition: "Raw",
        priceUsd: 400,
        status: "active",
        sellerId: "user_sender",
        acceptTradeOffers: true,
        images: [{ url: "https://img/off.jpg", sortOrder: 0 }],
        seller: { username: "sender" },
      },
    ]);

    const res = await POST(
      buildReq({
        requestedListingIds: ["req_1"],
        offeredListingIds: ["off_1"],
        proposerCashUsd: 20,
      }),
    );

    expect(res.status).toBe(200);
    const j = (await res.json()) as { redirectTo?: string };
    expect(j.redirectTo).toBe("/trade/trade_1");
    expect(hoisted.tradeOfferCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          proposerId: "user_sender",
          recipientId: "user_receiver",
          proposerCashUsd: 20,
          recipientCashUsd: 0,
          status: "pending",
        }),
      }),
    );
    expect(hoisted.tradeOfferItemCreateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            listingId: "req_1",
            listingTitleSnapshot: "Requested",
            side: "recipient",
          }),
          expect.objectContaining({
            listingId: "off_1",
            listingTitleSnapshot: "Offered",
            side: "proposer",
          }),
        ]),
      }),
    );
    expect(hoisted.tradeOfferEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: "offer_created", actorUserId: "user_sender" }),
      }),
    );
    expect(notifyTradeOfferCreated).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        offerId: "trade_1",
        recipientId: "user_receiver",
        requestedTitle: "Requested",
        offeredCount: 1,
      }),
    );
  });

  it("blocks self-trades", async () => {
    hoisted.findMany.mockResolvedValue([
      {
        id: "req_1",
        title: "Mine",
        category: "Trading Cards",
        condition: "Raw",
        priceUsd: 100,
        status: "active",
        sellerId: "user_sender",
        acceptTradeOffers: true,
        images: [],
        seller: { username: "sender" },
      },
      {
        id: "off_1",
        title: "Also mine",
        category: "Trading Cards",
        condition: "Raw",
        priceUsd: 120,
        status: "active",
        sellerId: "user_sender",
        acceptTradeOffers: true,
        images: [],
        seller: { username: "sender" },
      },
    ]);
    const res = await POST(buildReq({ requestedListingIds: ["req_1"], offeredListingIds: ["off_1"] }));
    expect(res.status).toBe(400);
  });

  it("blocks requested items from multiple owners", async () => {
    hoisted.findMany.mockResolvedValue([
      {
        id: "req_1",
        title: "Req1",
        category: "Trading Cards",
        condition: "Raw",
        priceUsd: 100,
        status: "active",
        sellerId: "user_a",
        acceptTradeOffers: true,
        images: [],
        seller: { username: "a" },
      },
      {
        id: "req_2",
        title: "Req2",
        category: "Trading Cards",
        condition: "Raw",
        priceUsd: 100,
        status: "active",
        sellerId: "user_b",
        acceptTradeOffers: true,
        images: [],
        seller: { username: "b" },
      },
      {
        id: "off_1",
        title: "Offered",
        category: "Trading Cards",
        condition: "Raw",
        priceUsd: 100,
        status: "active",
        sellerId: "user_sender",
        acceptTradeOffers: true,
        images: [],
        seller: { username: "sender" },
      },
    ]);
    const res = await POST(
      buildReq({ requestedListingIds: ["req_1", "req_2"], offeredListingIds: ["off_1"] }),
    );
    expect(res.status).toBe(400);
  });

  it("blocks unavailable requested listings", async () => {
    mockListingRows([
      {
        id: "req_1",
        title: "Req sold",
        category: "Trading Cards",
        condition: "Raw",
        priceUsd: 100,
        status: "sold",
        sellerId: "user_receiver",
        acceptTradeOffers: true,
        images: [],
        seller: { username: "receiver" },
      },
      {
        id: "off_1",
        title: "Offered",
        category: "Trading Cards",
        condition: "Raw",
        priceUsd: 100,
        status: "active",
        sellerId: "user_sender",
        acceptTradeOffers: true,
        images: [],
        seller: { username: "sender" },
      },
    ]);
    const res = await POST(buildReq({ requestedListingIds: ["req_1"], offeredListingIds: ["off_1"] }));
    expect(res.status).toBe(409);
  });

  it("blocks more than 5 items per side", async () => {
    const reqIds = ["a", "b", "c", "d", "e", "f"];
    const offIds = ["g"];
    const res = await POST(buildReq({ requestedListingIds: reqIds, offeredListingIds: offIds }));
    expect(res.status).toBe(400);
  });

  it("blocks duplicate active trade context", async () => {
    mockListingRows([
      {
        id: "req_1",
        title: "Requested",
        category: "Trading Cards",
        condition: "Raw",
        priceUsd: 100,
        status: "active",
        sellerId: "user_receiver",
        acceptTradeOffers: true,
        images: [],
        seller: { username: "receiver" },
      },
      {
        id: "off_1",
        title: "Offered",
        category: "Trading Cards",
        condition: "Raw",
        priceUsd: 100,
        status: "active",
        sellerId: "user_sender",
        acceptTradeOffers: true,
        images: [],
        seller: { username: "sender" },
      },
    ]);
    hoisted.findFirst.mockResolvedValue({ id: "existing_offer" });
    const res = await POST(buildReq({ requestedListingIds: ["req_1"], offeredListingIds: ["off_1"] }));
    expect(res.status).toBe(409);
  });

  it("rate limits rapid offer creation", async () => {
    mockListingRows([
      {
        id: "req_1",
        title: "Requested",
        category: "Trading Cards",
        condition: "PSA 10",
        priceUsd: 500,
        status: "active",
        sellerId: "user_receiver",
        acceptTradeOffers: true,
        images: [{ url: "https://img/req.jpg", sortOrder: 0 }],
        seller: { username: "receiver" },
      },
      {
        id: "off_1",
        title: "Offered",
        category: "Trading Cards",
        condition: "Raw",
        priceUsd: 400,
        status: "active",
        sellerId: "user_sender",
        acceptTradeOffers: true,
        images: [{ url: "https://img/off.jpg", sortOrder: 0 }],
        seller: { username: "sender" },
      },
    ]);

    let lastStatus = 0;
    for (let i = 0; i < 9; i++) {
      const res = await POST(buildReq({ requestedListingIds: ["req_1"], offeredListingIds: ["off_1"] }));
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });
});
