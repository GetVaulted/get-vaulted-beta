import { describe, expect, it } from "vitest";
import { buildCsvExport, escapeCsvCell, rowsToCsv } from "@/lib/admin/admin-csv";

describe("admin-csv", () => {
  it("escapes commas and quotes", () => {
    expect(escapeCsvCell('He said "hello"')).toBe('"He said ""hello"""');
    expect(escapeCsvCell("a,b")).toBe('"a,b"');
    expect(escapeCsvCell(null)).toBe("");
    expect(escapeCsvCell(42)).toBe("42");
  });

  it("builds RFC4180 rows with CRLF line endings", () => {
    const csv = rowsToCsv(["state", "gmvUsd"], [
      ["TX", 100.5],
      ["CA", 0],
    ]);
    expect(csv).toBe("state,gmvUsd\r\nTX,100.5\r\nCA,0\r\n");
  });

  it("builds export payload", () => {
    const csv = buildCsvExport({
      filename: "test",
      headers: ["metric", "value"],
      rows: [["gmvUsd", 1234]],
    });
    expect(csv).toContain("metric,value");
    expect(csv).toContain("gmvUsd,1234");
  });
});
