import { describe, expect, it } from "vitest";
import { shouldShowVaultPicksRail } from "@/components/marketplace/marketplace-browse-vault-picks";

// Regression (LOW, code review of same-day fix): the curated "Vault picks" rail must only ever
// show on the true first, unfiltered page — previously only `noFiltersActive` was checked, so
// clicking "Load more" (which keeps filters cleared) could keep growing/re-showing the rail past
// page 1.
describe("shouldShowVaultPicksRail", () => {
  it("shows the rail on the unfiltered first page", () => {
    expect(shouldShowVaultPicksRail(true, 1)).toBe(true);
  });

  it("hides the rail once past the first page, even with no filters active", () => {
    expect(shouldShowVaultPicksRail(true, 2)).toBe(false);
    expect(shouldShowVaultPicksRail(true, 3)).toBe(false);
  });

  it("hides the rail on the first page when filters are active", () => {
    expect(shouldShowVaultPicksRail(false, 1)).toBe(false);
  });

  it("hides the rail when both filtered and past the first page", () => {
    expect(shouldShowVaultPicksRail(false, 2)).toBe(false);
  });
});
