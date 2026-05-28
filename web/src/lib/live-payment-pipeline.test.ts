import { describe, expect, it } from "vitest";
import { LIVE_VARIANT_PURCHASE_PI_KIND } from "@/lib/live-payment-pipeline";

describe("live-payment-pipeline", () => {
  it("uses a dedicated PaymentIntent kind for saved-card variant purchases", () => {
    expect(LIVE_VARIANT_PURCHASE_PI_KIND).toBe("variant_purchase_saved_pm");
  });
});
