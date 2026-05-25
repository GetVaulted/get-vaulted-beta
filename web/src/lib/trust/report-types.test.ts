import { describe, expect, it } from "vitest";
import { isReportReason, isReportTargetType, REPORT_REASONS, REPORT_TARGET_TYPES } from "@/lib/trust/report-types";

describe("report-types", () => {
  it("validates target types", () => {
    for (const t of REPORT_TARGET_TYPES) {
      expect(isReportTargetType(t)).toBe(true);
    }
    expect(isReportTargetType("invalid")).toBe(false);
  });

  it("validates reasons", () => {
    for (const r of REPORT_REASONS) {
      expect(isReportReason(r)).toBe(true);
    }
    expect(isReportReason("bad")).toBe(false);
  });
});
