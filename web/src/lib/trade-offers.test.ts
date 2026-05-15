import { describe, expect, it, vi } from "vitest";
import { expireOfferIfNeeded } from "@/lib/trade-offers";

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
