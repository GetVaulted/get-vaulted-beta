import { afterEach, describe, expect, it, vi } from "vitest";
import {
  constructStripeWebhookEvent,
  isStripeConfigured,
  listStripeWebhookSecrets,
  marketplaceApplicationFeeCents,
  platformFeeCentsFromSubtotalUsd,
} from "@/lib/stripe";

const constructEvent = vi.hoisted(() => vi.fn());

vi.mock("stripe", () => ({
  default: vi.fn().mockImplementation(() => ({
    webhooks: { constructEvent },
  })),
}));

describe("listStripeWebhookSecrets", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns platform then connect secrets without duplicates", () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_platform");
    vi.stubEnv("STRIPE_CONNECT_WEBHOOK_SECRET", "whsec_connect");
    expect(listStripeWebhookSecrets()).toEqual(["whsec_platform", "whsec_connect"]);
  });

  it("dedupes when both env vars are the same", () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_same");
    vi.stubEnv("STRIPE_CONNECT_WEBHOOK_SECRET", "whsec_same");
    expect(listStripeWebhookSecrets()).toEqual(["whsec_same"]);
  });

  it("returns empty when unset", () => {
    expect(listStripeWebhookSecrets()).toEqual([]);
  });
});

describe("constructStripeWebhookEvent", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    constructEvent.mockReset();
  });

  it("tries connect secret when platform secret fails verification", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_12345678901");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_platform");
    vi.stubEnv("STRIPE_CONNECT_WEBHOOK_SECRET", "whsec_connect");
    constructEvent
      .mockImplementationOnce(() => {
        throw new Error("sig mismatch");
      })
      .mockReturnValueOnce({ id: "evt_connect", type: "account.updated" });

    const event = constructStripeWebhookEvent('{"id":"evt_connect"}', "sig_header");
    expect(event.type).toBe("account.updated");
    expect(constructEvent).toHaveBeenCalledTimes(2);
    expect(constructEvent.mock.calls[0]?.[2]).toBe("whsec_platform");
    expect(constructEvent.mock.calls[1]?.[2]).toBe("whsec_connect");
  });
});

describe("isStripeConfigured", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns true when STRIPE_SECRET_KEY is set and long enough", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_12345678901");
    expect(isStripeConfigured()).toBe(true);
  });

  it("returns false when STRIPE_SECRET_KEY is missing", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    expect(isStripeConfigured()).toBe(false);
  });

  it("returns false when STRIPE_SECRET_KEY is too short (invalid placeholder)", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_1");
    expect(isStripeConfigured()).toBe(false);
  });
});

describe("marketplaceApplicationFeeCents", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses fixed 8% for normal (non-company) listings", () => {
    const subtotal = 100;
    expect(marketplaceApplicationFeeCents(subtotal, false)).toBe(platformFeeCentsFromSubtotalUsd(subtotal));
    expect(marketplaceApplicationFeeCents(subtotal, false)).toBe(800);
  });

  it("returns 0 for company / merch listings regardless of percent", () => {
    expect(platformFeeCentsFromSubtotalUsd(100)).toBeGreaterThan(0);
    expect(marketplaceApplicationFeeCents(100, true)).toBe(0);
    expect(marketplaceApplicationFeeCents(9999, true)).toBe(0);
  });
});
