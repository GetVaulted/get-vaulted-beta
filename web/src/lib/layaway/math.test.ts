import { describe, expect, it } from "vitest";
import {
  layawayDepositUsd,
  layawayItemBalanceUsd,
  layawayRefundableAboveDepositUsd,
  layawayRemainingBalanceUsd,
} from "@/lib/layaway/math";

describe("layaway math", () => {
  it("computes 25% deposit", () => {
    expect(layawayDepositUsd(1000)).toBe(250);
    expect(layawayDepositUsd(500)).toBe(125);
  });

  it("computes item balance after deposit", () => {
    expect(layawayItemBalanceUsd(1000)).toBe(750);
  });

  it("includes shipping in remaining balance", () => {
    expect(layawayRemainingBalanceUsd({ itemPriceUsd: 1000, shippingPriceUsd: 15 })).toBe(765);
  });

  it("refunds only amounts above deposit on default", () => {
    expect(layawayRefundableAboveDepositUsd(250, 250)).toBe(0);
    expect(layawayRefundableAboveDepositUsd(450, 250)).toBe(200);
  });
});
