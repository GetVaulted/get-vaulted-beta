import { describe, expect, it } from "vitest";
import { emptyDays, summarizeDaily } from "./admin-daily-report";

describe("daily report helpers", () => {
  it("lays out one row per UTC day ending today", () => {
    const rows = emptyDays(3, new Date("2026-10-10T15:00:00Z"));
    expect(rows.map((r) => r.day)).toEqual(["2026-10-08", "2026-10-09", "2026-10-10"]);
  });
  it("totals and computes the refund rate", () => {
    const rows = emptyDays(2, new Date("2026-10-10T00:00:00Z"));
    rows[0].orders = 8; rows[0].gmvUsd = 100.5; rows[0].refunds = 1;
    rows[1].orders = 2; rows[1].gmvUsd = 50; rows[1].newMembers = 3;
    expect(summarizeDaily(rows)).toEqual({ orders: 10, gmvUsd: 150.5, refunds: 1, newMembers: 3, refundRatePct: 10 });
  });
  it("reports a 0% refund rate with no orders", () => {
    expect(summarizeDaily(emptyDays(1)).refundRatePct).toBe(0);
  });
});
