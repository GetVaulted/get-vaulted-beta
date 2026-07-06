import { createHmac } from "node:crypto";
import { describe, expect, it, afterEach, vi } from "vitest";
import { verifyShippoWebhookSignature, shippoValidateAddress } from "@/lib/shippo";

describe("verifyShippoWebhookSignature", () => {
  const prev = process.env.SHIPPO_WEBHOOK_SECRET;

  afterEach(() => {
    if (prev === undefined) delete process.env.SHIPPO_WEBHOOK_SECRET;
    else process.env.SHIPPO_WEBHOOK_SECRET = prev;
  });

  it("returns false when secret unset", () => {
    delete process.env.SHIPPO_WEBHOOK_SECRET;
    expect(verifyShippoWebhookSignature('{"a":1}', "abc")).toBe(false);
  });

  it("returns false when header missing", () => {
    process.env.SHIPPO_WEBHOOK_SECRET = "testsecret";
    expect(verifyShippoWebhookSignature('{"a":1}', null)).toBe(false);
  });

  it("accepts valid base64 hmac", () => {
    process.env.SHIPPO_WEBHOOK_SECRET = "testsecret";
    const raw = '{"event":"track_updated"}';
    const sig = createHmac("sha256", "testsecret").update(raw).digest("base64");
    expect(verifyShippoWebhookSignature(raw, sig)).toBe(true);
    expect(verifyShippoWebhookSignature(raw, `${sig}x`)).toBe(false);
  });
});

describe("shippoFetch timeout", () => {
  const prevToken = process.env.SHIPPO_API_TOKEN;
  const prevTimeout = process.env.SHIPPO_TIMEOUT_MS;

  afterEach(() => {
    if (prevToken === undefined) delete process.env.SHIPPO_API_TOKEN;
    else process.env.SHIPPO_API_TOKEN = prevToken;
    if (prevTimeout === undefined) delete process.env.SHIPPO_TIMEOUT_MS;
    else process.env.SHIPPO_TIMEOUT_MS = prevTimeout;
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("aborts and throws a clear timeout error instead of hanging forever", async () => {
    process.env.SHIPPO_API_TOKEN = "shippo_test_dummy";
    process.env.SHIPPO_TIMEOUT_MS = "50";

    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) => {
        return new Promise((_resolve, reject) => {
          const signal = init?.signal;
          signal?.addEventListener("abort", () => {
            const err = new Error("aborted");
            err.name = "AbortError";
            reject(err);
          });
        });
      })
    );

    await expect(
      shippoValidateAddress({
        name: "Test",
        street1: "1 Main St",
        city: "Austin",
        state: "TX",
        zip: "78701",
        country: "US",
      })
    ).rejects.toThrow(/Shippo request timed out after 50ms/);
  });
});
