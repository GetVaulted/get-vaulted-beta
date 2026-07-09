import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const hoisted = vi.hoisted(() => ({
  offersFindMany: vi.fn(),
  offersFindUnique: vi.fn(),
  offersUpdate: vi.fn(),
  offersUpdateMany: vi.fn(),
  eventsCreate: vi.fn(),
  itemsDeleteMany: vi.fn(),
  itemsCreateMany: vi.fn(),
  listingsFindMany: vi.fn(),
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

vi.mock("@/lib/resolve-listings-auth", () => ({
  resolveListingsUserId: vi.fn(),
}));

vi.mock("@/lib/trade-offer-notifications", () => ({
  notifyTradeOfferAccepted: vi.fn().mockResolvedValue(undefined),
  notifyTradeOfferDeclined: vi.fn().mockResolvedValue(undefined),
  notifyTradeOfferCancelled: vi.fn().mockResolvedValue(undefined),
  notifyTradeOfferCountered: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    tradeOffer: {
      findMany: hoisted.offersFindMany,
      findUnique: hoisted.offersFindUnique,
      update: hoisted.offersUpdate,
    },
    tradeOfferEvent: { create: hoisted.eventsCreate },
    tradeOfferItem: { deleteMany: hoisted.itemsDeleteMany, createMany: hoisted.itemsCreateMany },
    listing: { findMany: hoisted.listingsFindMany },
    user: { findUnique: vi.fn().mockResolvedValue({ username: "receiver" }) },
    $transaction: hoisted.transaction,
  },
}));

import {
  notifyTradeOfferAccepted,
  notifyTradeOfferCancelled,
  notifyTradeOfferCountered,
  notifyTradeOfferDeclined,
} from "@/lib/trade-offer-notifications";
import { getServerSessionSafe } from "@/lib/auth";
import { resolveListingsUserId } from "@/lib/resolve-listings-auth";
import { GET as listOffersGet } from "@/app/api/trade/offers/route";
import { GET as detailGet } from "@/app/api/trade/offers/[id]/route";
import { POST as acceptPost } from "@/app/api/trade/offers/[id]/accept/route";
import { POST as declinePost } from "@/app/api/trade/offers/[id]/decline/route";
import { POST as cancelPost } from "@/app/api/trade/offers/[id]/cancel/route";
import { POST as counterPost } from "@/app/api/trade/offers/[id]/counter/route";
import { __resetRateLimitsForTests } from "@/lib/request-rate-limit";

function offerBase(overrides: Record<string, unknown> = {}) {
  return {
    id: "trade_1",
    proposerId: "sender",
    recipientId: "receiver",
    status: "pending",
    proposerCashUsd: 0,
    recipientCashUsd: 0,
    messageToRecipient: "hello",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    expiresAt: new Date(Date.now() + 86400000),
    ...overrides,
  };
}

describe("trade offer management APIs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetRateLimitsForTests();
    vi.mocked(resolveListingsUserId).mockResolvedValue({ userId: "sender" });
    vi.mocked(getServerSessionSafe).mockResolvedValue({ user: { id: "sender", role: "user" } } as never);
    hoisted.transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) =>
      cb({
        tradeOffer: {
          findUnique: hoisted.offersFindUnique,
          update: hoisted.offersUpdate,
          updateMany: hoisted.offersUpdateMany,
        },
        tradeOfferEvent: { create: hoisted.eventsCreate },
        tradeOfferItem: { deleteMany: hoisted.itemsDeleteMany, createMany: hoisted.itemsCreateMany },
        listing: { findMany: hoisted.listingsFindMany },
      }),
    );
    hoisted.offersUpdateMany.mockResolvedValue({ count: 1 });
  });

  it("lists sent/received offers", async () => {
    hoisted.offersFindMany.mockResolvedValue([
      {
        ...offerBase(),
        proposer: { username: "sender" },
        recipient: { username: "receiver" },
        items: [
          { side: "proposer", listingPriceUsdSnapshot: 100 },
          { side: "recipient", listingPriceUsdSnapshot: 200 },
        ],
      },
    ]);
    const res = await listOffersGet(new Request("http://x"));
    expect(res.status).toBe(200);
    const j = (await res.json()) as { offers: Array<{ id: string }>; viewerId: string };
    expect(j.offers[0]?.id).toBe("trade_1");
    expect(j.viewerId).toBe("sender");
  });

  it("blocks unauthenticated list access", async () => {
    vi.mocked(resolveListingsUserId).mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );
    const res = await listOffersGet(new Request("http://x"));
    expect(res.status).toBe(401);
  });

  it("restricts detail to participants/admin", async () => {
    hoisted.offersFindUnique.mockResolvedValue({
      ...offerBase(),
      proposer: { id: "sender", username: "sender" },
      recipient: { id: "receiver", username: "receiver" },
      items: [],
      events: [],
    });
    vi.mocked(resolveListingsUserId).mockResolvedValue({ userId: "other" });
    vi.mocked(getServerSessionSafe).mockResolvedValue({ user: { id: "other", role: "user" } } as never);
    const res = await detailGet(new Request("http://x"), { params: Promise.resolve({ id: "trade_1" }) });
    expect(res.status).toBe(404);
  });

  it("accept succeeds for receiver with valid listings", async () => {
    vi.mocked(resolveListingsUserId).mockResolvedValue({ userId: "receiver" });
    vi.mocked(getServerSessionSafe).mockResolvedValue({ user: { id: "receiver", role: "user" } } as never);
    hoisted.offersFindUnique.mockResolvedValue({
      ...offerBase({ proposerId: "sender", recipientId: "receiver" }),
      items: [
        { listingId: "r1", ownerUserId: "receiver" },
        { listingId: "s1", ownerUserId: "sender" },
      ],
    });
    hoisted.listingsFindMany.mockResolvedValue([
      { id: "r1", sellerId: "receiver", status: "active" },
      { id: "s1", sellerId: "sender", status: "active" },
    ]);
    const res = await acceptPost(new Request("http://x"), { params: Promise.resolve({ id: "trade_1" }) });
    expect(res.status).toBe(200);
    expect(hoisted.offersUpdate).toHaveBeenCalled();
    expect(notifyTradeOfferAccepted).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ offerId: "trade_1", proposerId: "sender" }),
    );
  });

  it("blocks unauthenticated action access", async () => {
    vi.mocked(resolveListingsUserId).mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );
    const res = await acceptPost(new Request("http://x"), { params: Promise.resolve({ id: "trade_1" }) });
    expect(res.status).toBe(401);
  });

  it("accept blocks stale/unavailable listing", async () => {
    vi.mocked(resolveListingsUserId).mockResolvedValue({ userId: "receiver" });
    vi.mocked(getServerSessionSafe).mockResolvedValue({ user: { id: "receiver", role: "user" } } as never);
    hoisted.offersFindUnique.mockResolvedValue({
      ...offerBase({ proposerId: "sender", recipientId: "receiver" }),
      items: [{ listingId: "r1", ownerUserId: "receiver" }],
    });
    hoisted.listingsFindMany.mockResolvedValue([{ id: "r1", sellerId: "receiver", status: "sold" }]);
    const res = await acceptPost(new Request("http://x"), { params: Promise.resolve({ id: "trade_1" }) });
    expect(res.status).toBe(409);
  });

  it("decline succeeds", async () => {
    vi.mocked(resolveListingsUserId).mockResolvedValue({ userId: "receiver" });
    vi.mocked(getServerSessionSafe).mockResolvedValue({ user: { id: "receiver", role: "user" } } as never);
    hoisted.offersFindUnique.mockResolvedValue(offerBase({ recipientId: "receiver" }));
    const res = await declinePost(new Request("http://x"), { params: Promise.resolve({ id: "trade_1" }) });
    expect(res.status).toBe(200);
    expect(notifyTradeOfferDeclined).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ offerId: "trade_1", proposerId: "sender" }),
    );
  });

  it("cancel succeeds for sender", async () => {
    hoisted.offersFindUnique.mockResolvedValue(offerBase({ proposerId: "sender" }));
    const res = await cancelPost(new Request("http://x"), { params: Promise.resolve({ id: "trade_1" }) });
    expect(res.status).toBe(200);
    expect(notifyTradeOfferCancelled).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ offerId: "trade_1", recipientId: "receiver" }),
    );
  });

  it("counter succeeds and writes item snapshots", async () => {
    hoisted.offersFindUnique.mockResolvedValue({
      ...offerBase({ proposerId: "sender", recipientId: "receiver" }),
      items: [
        { side: "recipient", listingId: "r1" },
        { side: "proposer", listingId: "s1" },
      ],
    });
    hoisted.listingsFindMany.mockResolvedValue([
      {
        id: "r1",
        title: "Req",
        category: "Trading Cards",
        condition: "Raw",
        priceUsd: 200,
        status: "active",
        acceptTradeOffers: true,
        sellerId: "receiver",
        images: [{ url: "r.jpg" }],
      },
      {
        id: "s1",
        title: "Off",
        category: "Trading Cards",
        condition: "Raw",
        priceUsd: 190,
        status: "active",
        acceptTradeOffers: true,
        sellerId: "sender",
        images: [{ url: "s.jpg" }],
      },
    ]);
    const req = new Request("http://x", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proposerCashUsd: 10 }),
    });
    const res = await counterPost(req, { params: Promise.resolve({ id: "trade_1" }) });
    expect(res.status).toBe(200);
    expect(hoisted.itemsCreateMany).toHaveBeenCalled();
    expect(notifyTradeOfferCountered).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ offerId: "trade_1", recipientUserId: "receiver" }),
    );
  });

  it("blocks counter for non-participants", async () => {
    vi.mocked(resolveListingsUserId).mockResolvedValue({ userId: "outsider" });
    vi.mocked(getServerSessionSafe).mockResolvedValue({ user: { id: "outsider", role: "user" } } as never);
    hoisted.offersFindUnique.mockResolvedValue({
      ...offerBase({ proposerId: "sender", recipientId: "receiver" }),
      items: [
        { side: "recipient", listingId: "r1" },
        { side: "proposer", listingId: "s1" },
      ],
    });
    const res = await counterPost(new Request("http://x", { method: "POST" }), {
      params: Promise.resolve({ id: "trade_1" }),
    });
    expect(res.status).toBe(403);
  });

  it("rate limits rapid counters", async () => {
    hoisted.offersFindUnique.mockResolvedValue({
      ...offerBase({ proposerId: "sender", recipientId: "receiver" }),
      items: [
        { side: "recipient", listingId: "r1" },
        { side: "proposer", listingId: "s1" },
      ],
    });
    hoisted.listingsFindMany.mockResolvedValue([
      {
        id: "r1",
        title: "Req",
        category: "Trading Cards",
        condition: "Raw",
        priceUsd: 200,
        status: "active",
        acceptTradeOffers: true,
        sellerId: "receiver",
        images: [{ url: "r.jpg" }],
      },
      {
        id: "s1",
        title: "Off",
        category: "Trading Cards",
        condition: "Raw",
        priceUsd: 190,
        status: "active",
        acceptTradeOffers: true,
        sellerId: "sender",
        images: [{ url: "s.jpg" }],
      },
    ]);
    let last = 0;
    for (let i = 0; i < 6; i++) {
      const res = await counterPost(new Request("http://x", { method: "POST" }), {
        params: Promise.resolve({ id: "trade_1" }),
      });
      last = res.status;
    }
    expect(last).toBe(429);
  });

  it("invalid transition blocked for terminal status", async () => {
    hoisted.offersFindUnique.mockResolvedValue(offerBase({ status: "declined" }));
    const res = await cancelPost(new Request("http://x"), { params: Promise.resolve({ id: "trade_1" }) });
    expect(res.status).toBe(409);
  });

  it("expired offer blocks actions", async () => {
    hoisted.offersFindUnique.mockResolvedValue(
      offerBase({ status: "pending", expiresAt: new Date(Date.now() - 1000), proposerId: "sender" }),
    );
    const res = await cancelPost(new Request("http://x"), { params: Promise.resolve({ id: "trade_1" }) });
    expect(res.status).toBe(409);
  });
});
