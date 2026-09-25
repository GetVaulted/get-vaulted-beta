import { describe, expect, it } from "vitest";
import {
  orderItemSaleBasisUsd,
  orderItemSaleBasisCents,
  referralCreditAppliedCents,
} from "@/lib/referral-credit-payout";

describe("referral-credit-payout", () => {
  it("sale basis is buyer item + applied credit", () => {
    expect(orderItemSaleBasisUsd({ itemPriceUsd: 90, referralCreditAppliedUsd: 10 })).toBe(100);
    expect(orderItemSaleBasisCents({ itemPriceUsd: 90, referralCreditAppliedUsd: 10 })).toBe(10000);
    expect(referralCreditAppliedCents({ referralCreditAppliedUsd: 10 })).toBe(1000);
  });

  it("treats missing credit as zero", () => {
    expect(orderItemSaleBasisUsd({ itemPriceUsd: 50 })).toBe(50);
    expect(referralCreditAppliedCents({})).toBe(0);
  });
});
