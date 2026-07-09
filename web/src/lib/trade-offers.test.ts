import { describe, expect, it, vi } from "vitest";
import { expireOfferIfNeeded, formatTradeEventNote } from "@/lib/trade-offers";

describe("formatTradeEventNote", () => {
  it("formats offer_created JSON into readable trade terms", () => {
    const detail = formatTradeEventNote(
      "offer_created",
      JSON.stringify({
        requestedListingIds: ["cmrdwt7sn000909juzbgf05nd"],
        offeredListingIds: ["cmrdr1fpe000009jr7fogs3g6"],
        proposerCashUsd: 0,
        recipientCashUsd: 0,
        expiresAt: "2026-07-16T20:01:58.210Z",
      }),
    );
    expect(detail).toContain("1 item offered for 1 item requested");
    expect(detail).toContain("Expires");
    expect(detail).not.toContain("requestedListingIds");
  });
});

describe("expireOfferIfNeeded", () => {
  it("writes exactly one expire event when status transitions", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const create = vi.fn().mockResolvedValue({ id: "evt_1" });
    const prisma = {
      tradeOffer: { updateMany },
      tradeOfferEvent: { create },
    } as unknown as Parameters<typeof expireOfferIfNeeded>[0];

    const next = await expireOfferIfNeeded(prisma, {
      id: "offer_1",
      status: "pending",
      expiresAt: new Date(Date.now() - 1000),
    });

    expect(next).toBe("expired");
    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("does not duplicate expire event if already expired by another path", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const create = vi.fn();
    const prisma = {
      tradeOffer: { updateMany },
      tradeOfferEvent: { create },
    } as unknown as Parameters<typeof expireOfferIfNeeded>[0];

    const next = await expireOfferIfNeeded(prisma, {
      id: "offer_1",
      status: "pending",
      expiresAt: new Date(Date.now() - 1000),
    });

    expect(next).toBe("expired");
    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(create).not.toHaveBeenCalled();
  });
});
