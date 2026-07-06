import { describe, expect, it } from "vitest";
import { toUserFacingErrorMessage } from "./user-facing-error-message";

describe("toUserFacingErrorMessage", () => {
  it("replaces developer-facing Stripe config errors with the fallback", () => {
    expect(
      toUserFacingErrorMessage("Stripe is not configured. Add test keys to .env (see .env.example).", "fallback"),
    ).toBe("fallback");
  });

  it("replaces generic 'not configured' errors with the fallback", () => {
    expect(toUserFacingErrorMessage("Stripe is not configured on this server.", "fallback")).toBe("fallback");
  });

  it("replaces internal error codes with the fallback", () => {
    expect(toUserFacingErrorMessage("STRIPE_NOT_CONFIGURED", "fallback")).toBe("fallback");
  });

  it("passes through normal validation errors untouched", () => {
    expect(toUserFacingErrorMessage("Minimum bid is $26.00.", "fallback")).toBe("Minimum bid is $26.00.");
  });

  it("falls back when the error is missing, empty, or whitespace", () => {
    expect(toUserFacingErrorMessage(undefined, "fallback")).toBe("fallback");
    expect(toUserFacingErrorMessage(null, "fallback")).toBe("fallback");
    expect(toUserFacingErrorMessage("   ", "fallback")).toBe("fallback");
  });
});
