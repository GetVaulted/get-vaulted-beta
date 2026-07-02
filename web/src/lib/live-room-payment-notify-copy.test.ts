import { describe, expect, it } from "vitest";
import { liveRoomBuyerPaymentConfirmedNotification } from "./live-room-payment-notify-copy";

describe("live-room-payment-notify-copy", () => {
  it("uses payment amount only (no team or spot label)", () => {
    const note = liveRoomBuyerPaymentConfirmedNotification({
      amountUsd: 24.99,
      href: "/account/orders?view=live",
    });
    expect(note.type).toBe("purchase_complete");
    expect(note.title).toBe("Payment confirmed");
    expect(note.body).toBe("$24.99 charged for your live purchase.");
    expect(note.body).not.toMatch(/team|division|revealed/i);
  });
});
