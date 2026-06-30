import { describe, expect, it } from "vitest";
import { stripeKeyMode, stripeKeysAligned } from "@/lib/stripe-key-mode";

describe("stripeKeyMode", () => {
  it("detects live publishable keys", () => {
    expect(stripeKeyMode("pk_live_abc")).toBe("live");
  });

  it("detects test secret keys", () => {
    expect(stripeKeyMode("sk_test_12345678901")).toBe("test");
  });

  it("returns unknown for empty or unrecognized keys", () => {
    expect(stripeKeyMode("")).toBe("unknown");
    expect(stripeKeyMode("not_a_stripe_key")).toBe("unknown");
  });
});

describe("stripeKeysAligned", () => {
  it("returns true when both keys share mode", () => {
    expect(stripeKeysAligned("live", "live")).toBe(true);
    expect(stripeKeysAligned("test", "test")).toBe(true);
  });

  it("returns false when modes differ", () => {
    expect(stripeKeysAligned("live", "test")).toBe(false);
  });

  it("returns null when either mode is unknown", () => {
    expect(stripeKeysAligned("unknown", "live")).toBeNull();
  });
});
