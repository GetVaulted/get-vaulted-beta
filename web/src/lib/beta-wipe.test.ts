import { describe, expect, it } from "vitest";
import { betaTruncateSql, BETA_APP_TABLES } from "../../scripts/lib/beta-app-tables";
import { EXPECTED_BETA_PROJECT_REF } from "./beta-qa-scope";

describe("beta-app-tables", () => {
  it("includes User and all commerce tables", () => {
    expect(BETA_APP_TABLES).toContain("User");
    expect(BETA_APP_TABLES).toContain("Listing");
    expect(BETA_APP_TABLES).toContain("LiveRoom");
    expect(BETA_APP_TABLES).toContain("Order");
    expect(BETA_APP_TABLES).toContain("Message");
  });

  it("generates TRUNCATE CASCADE SQL", () => {
    const sql = betaTruncateSql();
    expect(sql).toContain('TRUNCATE TABLE');
    expect(sql).toContain('"User"');
    expect(sql).toContain("CASCADE");
  });
});

describe("beta project ref allowlist", () => {
  it("beta ref is fixed for wipe scripts", () => {
    expect(EXPECTED_BETA_PROJECT_REF).toBe("xkaaicokjgmpbctfermj");
  });
});
