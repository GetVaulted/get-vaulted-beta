import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/notifications", () => ({
  createNotification: vi.fn().mockResolvedValue("notif_1"),
}));

import { createNotification } from "@/lib/notifications";
import { notifyTradeOfferCreated } from "./trade-offer-notifications";

describe("trade-offer-notifications", () => {
  it("notifies the recipient when a trade offer is created", async () => {
    await notifyTradeOfferCreated({} as never, {
      offerId: "trade_1",
      recipientId: "user_recv",
      proposerUsername: "sender",
      requestedTitle: "PSA 10 Charizard",
      offeredCount: 1,
    });

    expect(createNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: "user_recv",
        type: "trade_offer_received",
        title: "New trade offer",
        href: "/trade/trade_1",
      }),
    );
  });
});
