import { describe, expect, it } from "vitest";
import { resolveLedgerDateRange, ledgerRangeToLegacy } from "@/lib/admin/financial-ledger-range";

describe("resolveLedgerDateRange", () => {
  const now = new Date("2026-07-19T15:00:00.000Z");

  it("resolves today to UTC midnight", () => {
    const r = resolveLedgerDateRange({ range: "today", now });
    expect(r.rangeKey).toBe("today");
    expect(r.rangeStart?.toISOString()).toBe("2026-07-19T00:00:00.000Z");
    expect(r.rangeEnd).toBeNull();
  });

  it("resolves yesterday with exclusive end", () => {
    const r = resolveLedgerDateRange({ range: "yesterday", now });
    expect(r.rangeStart?.toISOString()).toBe("2026-07-18T00:00:00.000Z");
    expect(r.rangeEnd?.toISOString()).toBe("2026-07-19T00:00:00.000Z");
  });

  it("maps custom from/to", () => {
    const r = resolveLedgerDateRange({
      range: "custom",
      from: "2026-07-01",
      to: "2026-07-10",
      now,
    });
    expect(r.rangeKey).toBe("custom");
    expect(r.rangeStart).toBeTruthy();
    expect(r.rangeEnd).toBeTruthy();
  });

  it("maps ledger keys to legacy stripe loaders", () => {
    expect(ledgerRangeToLegacy("today")).toBe("24h");
    expect(ledgerRangeToLegacy("mtd")).toBe("30d");
    expect(ledgerRangeToLegacy("all")).toBe("all");
  });
});
