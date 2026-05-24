import { describe, expect, it } from "vitest";
import {
  BETA_QA_BUYER_EMAIL,
  BETA_QA_SELLER_EMAIL,
  isCanonicalBetaQaEmail,
  isDeletableFixtureEmail,
  isQaClutterAccount,
} from "./beta-qa-scope";

describe("beta-qa-scope", () => {
  it("recognizes canonical QA emails", () => {
    expect(isCanonicalBetaQaEmail(BETA_QA_SELLER_EMAIL)).toBe(true);
    expect(isCanonicalBetaQaEmail(BETA_QA_BUYER_EMAIL)).toBe(true);
    expect(isCanonicalBetaQaEmail("other@getvaultedtest.com")).toBe(false);
  });

  it("flags disposable fixture emails", () => {
    expect(isDeletableFixtureEmail("seed+seller@getvaulted.internal")).toBe(true);
    expect(isDeletableFixtureEmail("qa_live_seller_123@test.internal")).toBe(true);
    expect(isDeletableFixtureEmail(BETA_QA_SELLER_EMAIL)).toBe(false);
  });

  it("does not treat real storefront emails as clutter", () => {
    expect(isQaClutterAccount("real.seller@gmail.com", "realseller")).toBe(false);
  });

  it("flags legacy and extra QA accounts as clutter", () => {
    expect(isQaClutterAccount("brysmith31@gmail.com", "brysmith31")).toBe(true);
    expect(isQaClutterAccount("oldtest@getvaultedtest.com", "oldtest")).toBe(true);
    expect(isQaClutterAccount(BETA_QA_SELLER_EMAIL, "sellerqa")).toBe(false);
  });
});
