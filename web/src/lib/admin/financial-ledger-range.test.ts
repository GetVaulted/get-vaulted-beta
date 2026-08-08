import { describe, expect, it } from "vitest";
import {
  resolveLedgerDateRange,
  ledgerRangeToLegacy,
  ADMIN_LEDGER_TIMEZONE,
} from "@/lib/admin/financial-ledger-range";

describe("resolveLedgerDateRange", () => {
  // 2026-07-19 15:00 UTC = 10:00 America/Chicago (CDT, UTC-5)
  const now = new Date("2026-07-19T15:00:00.000Z");

  it("resolves today to Chicago midnight", () => {
    const r = resolveLedgerDateRange({ range: "today", now });
    expect(r.rangeKey).toBe("today");
    expect(r.rangeStart?.toISOString()).toBe("2026-07-19T05:00:00.000Z");
    expect(r.rangeEnd).toBeNull();
  });

  it("resolves yesterday with exclusive end at Chicago midnight", () => {
    const r = resolveLedgerDateRange({ range: "yesterday", now });
    expect(r.rangeStart?.toISOString()).toBe("2026-07-18T05:00:00.000Z");
    expect(r.rangeEnd?.toISOString()).toBe("2026-07-19T05:00:00.000Z");
  });

  it("uses America/Chicago by default", () => {
    expect(ADMIN_LEDGER_TIMEZONE).toBe("America/Chicago");
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
