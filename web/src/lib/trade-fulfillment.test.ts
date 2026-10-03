import { describe, expect, it, vi, beforeEach } from "vitest";

const { findUnique, update, createEvent, transaction } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
  createEvent: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    tradeOffer: { findUnique, update },
    tradeOfferEvent: { create: createEvent },
    $transaction: (...args: unknown[]) => transaction(...args),
  },
}));

import { confirmTradePartyReceived, markTradePartyShipped } from "@/lib/trade-fulfillment";

const baseOffer = {
  id: "t1",
  status: "accepted",
  proposerId: "u-proposer",
  recipientId: "u-recipient",
  proposerLabelPurchasedAt: new Date("2026-07-01T00:00:00Z"),
  recipientLabelPurchasedAt: new Date("2026-07-01T00:00:00Z"),
  proposerLabelUrl: "https://label/p",
  recipientLabelUrl: "https://label/r",
  proposerTrackingNumber: "TRACK-P",
  recipientTrackingNumber: "TRACK-R",
  proposerShippedAt: null as Date | null,
  recipientShippedAt: null as Date | null,
  proposerReceivedAt: null as Date | null,
  recipientReceivedAt: null as Date | null,
};

describe("trade-fulfillment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transaction.mockImplementation(async (arg: unknown) => {
      if (typeof arg === "function") {
        return arg({
          tradeOffer: { update },
          tradeOfferEvent: { create: createEvent },
        });
      }
      return Promise.all(arg as Promise<unknown>[]);
    });
    update.mockResolvedValue({});
    createEvent.mockResolvedValue({});
  });

  it("markTradePartyShipped requires a purchased label", async () => {
    findUnique.mockResolvedValue({
      ...baseOffer,
      proposerLabelPurchasedAt: null,
      proposerLabelUrl: null,
    });
    const res = await markTradePartyShipped({ tradeOfferId: "t1", actorUserId: "u-proposer" });
    expect(res).toEqual({
      ok: false,
      error: "Buy your shipping label before marking this package as shipped.",
      status: 409,
    });
  });

  it("markTradePartyShipped writes shippedAt + event", async () => {
    findUnique.mockResolvedValue(baseOffer);
    const res = await markTradePartyShipped({ tradeOfferId: "t1", actorUserId: "u-proposer" });
    expect(res).toEqual({ ok: true, alreadyDone: false, completed: false });
    expect(update).toHaveBeenCalled();
    expect(createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: "party_shipped" }),
      }),
    );
  });

  it("confirmTradePartyReceived waits for partner shipped", async () => {
    findUnique.mockResolvedValue(baseOffer);
    const res = await confirmTradePartyReceived({ tradeOfferId: "t1", actorUserId: "u-proposer" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(409);
  });

  it("confirmTradePartyReceived completes when both sides confirm", async () => {
    findUnique.mockResolvedValue({
      ...baseOffer,
      proposerShippedAt: new Date("2026-07-02T00:00:00Z"),
      recipientShippedAt: new Date("2026-07-02T00:00:00Z"),
      recipientReceivedAt: new Date("2026-07-03T00:00:00Z"),
    });
    const res = await confirmTradePartyReceived({ tradeOfferId: "t1", actorUserId: "u-proposer" });
    expect(res).toEqual({ ok: true, alreadyDone: false, completed: true });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "completed" }),
      }),
    );
    expect(createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: "offer_completed" }),
      }),
    );
  });
});
