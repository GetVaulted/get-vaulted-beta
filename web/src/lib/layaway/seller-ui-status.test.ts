import { describe, expect, it } from "vitest";
import { deriveSellerLayawayUi } from "@/lib/layaway/seller-ui-status";

describe("seller-ui-status", () => {
  it("active layaway with future due date stays in active bucket", () => {
    const ui = deriveSellerLayawayUi({
      status: "active",
      dueAt: new Date(Date.now() + 86_400_000),
      remainingBalanceUsd: 120,
    });
    expect(ui.bucket).toBe("active");
    expect(ui.displayStatus).toBe("active");
  });

  it("canceled/refunded layaway is not active bucket", () => {
    const ui = deriveSellerLayawayUi({
      status: "refunded",
      dueAt: new Date(),
      remainingBalanceUsd: 0,
    });
    expect(ui.bucket).toBe("overdueOrDefaulted");
    expect(ui.displayStatus).toBe("canceled");
  });
});
