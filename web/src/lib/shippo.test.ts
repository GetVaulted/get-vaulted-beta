import { createHmac } from "node:crypto";
import { describe, expect, it, afterEach } from "vitest";
import { verifyShippoWebhookSignature } from "@/lib/shippo";

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
