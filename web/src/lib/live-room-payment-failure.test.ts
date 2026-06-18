import { describe, expect, it } from "vitest";
import {
  chargeOutcomeToFailureReason,
  chargeOutcomeToFailureStatus,
} from "@/lib/live-room-payment-failure";

describe("live-room-payment-failure helpers", () => {
  it("maps declined card to payment_failed", () => {
    expect(
      chargeOutcomeToFailureStatus({ outcome: "error", code: "CARD_DECLINED" }),
    ).toBe("payment_failed");
    expect(chargeOutcomeToFailureReason({ outcome: "error", code: "CARD_DECLINED" })).toBe(
      "Your card was declined.",
    );
  });

  it("maps requires_action to recovery_pending", () => {
    expect(
      chargeOutcomeToFailureStatus({
        outcome: "requires_action",
        clientSecret: "cs",
        paymentIntentId: "pi",
      }),
    ).toBe("recovery_pending");
    expect(
      chargeOutcomeToFailureReason({
        outcome: "requires_action",
        clientSecret: "cs",
        paymentIntentId: "pi",
      }),
    ).toContain("verification");
  });

  it("maps incomplete live charges to payment_failed recovery state", () => {
    expect(
      chargeOutcomeToFailureStatus({ outcome: "error", code: "PAYMENT_INTENT_NOT_COMPLETED" }),
    ).toBe("payment_failed");
    expect(
      chargeOutcomeToFailureStatus({ outcome: "error", code: "CARD_DECLINED" }),
    ).toBe("payment_failed");
  });
});
