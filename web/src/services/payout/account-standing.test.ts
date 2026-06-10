import { describe, expect, it } from "vitest";
import { AccountStanding, SellerFraudStatus } from "@/generated/prisma/enums";
import { computeAccountStanding } from "@/services/payout/account-standing";

const base = {
  completedOrders: 50,
  cancellationRate: 0.005,
  chargebackRate: 0,
  disputeRate: 0.005,
  trackingComplianceRate: 0.95,
  fraudStatus: SellerFraudStatus.none,
  unresolvedDisputeCount: 0,
  excessiveShippingDelayCount: 0,
  accountSuspended: false,
};

describe("computeAccountStanding", () => {
  it("returns excellent for strong operational metrics", () => {
    expect(computeAccountStanding(base)).toBe(AccountStanding.excellent);
  });

  it("returns restricted for fraud flags", () => {
    expect(
      computeAccountStanding({ ...base, fraudStatus: SellerFraudStatus.flagged }),
    ).toBe(AccountStanding.restricted);
  });

  it("returns needs_attention for elevated dispute rate", () => {
    expect(computeAccountStanding({ ...base, disputeRate: 0.03 })).toBe(AccountStanding.needs_attention);
  });
});
