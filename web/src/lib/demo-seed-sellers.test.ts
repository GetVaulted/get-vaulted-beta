import { describe, expect, it } from "vitest";
import {
  INTEGRATION_TEST_EMAIL_SUFFIX,
  isHiddenFixtureSellerEmail,
  isIntegrationTestSellerEmail,
  prismaSellerVisibleOnPublicMarketplace,
} from "./demo-seed-sellers";

describe("demo-seed-sellers", () => {
  it("hides integration test sellers from public catalog", () => {
    expect(isIntegrationTestSellerEmail("sellerlr@test.internal")).toBe(true);
    expect(isHiddenFixtureSellerEmail("sellerlr@test.internal")).toBe(true);
    expect(isHiddenFixtureSellerEmail("sellerqa@getvaultedtest.com")).toBe(false);
    expect(isHiddenFixtureSellerEmail("screenshots.cardvault@getvaultedtest.com")).toBe(true);
  });

  it("excludes fixture emails from prismaSellerVisibleOnPublicMarketplace", () => {
    const where = prismaSellerVisibleOnPublicMarketplace();
    expect(JSON.stringify(where)).toContain(INTEGRATION_TEST_EMAIL_SUFFIX);
    expect(JSON.stringify(where)).toContain("@getvaulted.internal");
    expect(JSON.stringify(where)).toContain("screenshots.");
  });
});
