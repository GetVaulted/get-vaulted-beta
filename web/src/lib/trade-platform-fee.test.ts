import { describe, expect, it } from "vitest";
import { GET_VAULTED_TRADE_PLATFORM_FEE_USD, tradePlatformFeeCents } from "@/lib/trade-platform-fee";

describe("trade-platform-fee", () => {
  it("is a flat $2.99 per party", () => {
    expect(GET_VAULTED_TRADE_PLATFORM_FEE_USD).toBe(2.99);
    expect(tradePlatformFeeCents()).toBe(299);
  });
});
