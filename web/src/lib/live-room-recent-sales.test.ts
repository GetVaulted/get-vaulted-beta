import { describe, expect, it } from "vitest";
import { includeHostRecentSaleRow } from "./live-room-recent-sales";

describe("includeHostRecentSaleRow", () => {
  it("includes paid and failed rows only", () => {
    expect(includeHostRecentSaleRow({ paymentTone: "paid" })).toBe(true);
    expect(includeHostRecentSaleRow({ paymentTone: "retry" })).toBe(true);
    expect(includeHostRecentSaleRow({ paymentTone: "pending" })).toBe(false);
  });
});
