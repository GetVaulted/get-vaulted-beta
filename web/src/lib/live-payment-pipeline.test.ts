import { describe, expect, it } from "vitest";
import {
  LIVE_VARIANT_PURCHASE_PI_KIND,
  liveSavedCardStripeIdempotencyKey,
} from "@/lib/live-payment-pipeline";

describe("live-payment-pipeline", () => {
  it("uses a dedicated PaymentIntent kind for saved-card variant purchases", () => {
    expect(LIVE_VARIANT_PURCHASE_PI_KIND).toBe("variant_purchase_saved_pm");
  });

  it("changes Stripe idempotency key after a dead intent is cleared", () => {
    const base = {
      prefix: "variant_saved_pm",
      referenceId: "pur_1",
      amountCents: 3500,
      paymentMethodId: "pm_1",
      chargeAttemptMs: 1_700_000_000_000,
    };
    const first = liveSavedCardStripeIdempotencyKey(base);
    const retry = liveSavedCardStripeIdempotencyKey({
      ...base,
      chargeAttemptMs: 1_700_000_030_000,
      clearedDeadIntentId: "pi_dead",
    });
    expect(first).not.toBe(retry);
    expect(retry).toContain("_after_pi_dead");
  });
});
