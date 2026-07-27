import { describe, expect, it } from "vitest";
import {
  resolveTradeSecurityDepositUsd,
  tradeRequiresSecurityDeposit,
  TRADE_SECURITY_DEPOSIT_MAX_USD,
  TRADE_SECURITY_DEPOSIT_MIN_USD,
  TRADE_SECURITY_DEPOSIT_PERCENT,
} from "@/lib/trade-security-deposit";

describe("trade-security-deposit", () => {
  it("requires deposit only on $0 cash trades", () => {
    expect(tradeRequiresSecurityDeposit({ proposerCashUsd: 0, recipientCashUsd: 0 })).toBe(true);
    expect(tradeRequiresSecurityDeposit({ proposerCashUsd: 10, recipientCashUsd: 0 })).toBe(false);
  });

  it("uses 25% of higher side clamped to $100–$500", () => {
    expect(TRADE_SECURITY_DEPOSIT_PERCENT).toBe(0.25);
    expect(TRADE_SECURITY_DEPOSIT_MIN_USD).toBe(100);
    expect(TRADE_SECURITY_DEPOSIT_MAX_USD).toBe(500);

    // 25% of $200 = $50 → min $100
    expect(
      resolveTradeSecurityDepositUsd({
        proposerCashUsd: 0,
        recipientCashUsd: 0,
        proposerItemsValueUsd: 200,
        recipientItemsValueUsd: 150,
      }),
    ).toBe(100);

    // 25% of $800 = $200
    expect(
      resolveTradeSecurityDepositUsd({
        proposerCashUsd: 0,
        recipientCashUsd: 0,
        proposerItemsValueUsd: 400,
        recipientItemsValueUsd: 800,
      }),
    ).toBe(200);

    // 25% of $3000 = $750 → max $500
    expect(
      resolveTradeSecurityDepositUsd({
        proposerCashUsd: 0,
        recipientCashUsd: 0,
        proposerItemsValueUsd: 3000,
        recipientItemsValueUsd: 1000,
      }),
    ).toBe(500);
  });

  it("prefers locked securityDepositCents when present", () => {
    expect(
      resolveTradeSecurityDepositUsd({
        proposerCashUsd: 0,
        recipientCashUsd: 0,
        proposerItemsValueUsd: 800,
        recipientItemsValueUsd: 800,
        securityDepositCents: 17500,
      }),
    ).toBe(175);
  });
});
