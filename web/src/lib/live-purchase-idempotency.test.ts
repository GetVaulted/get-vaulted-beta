import { describe, expect, it } from "vitest";
import { scopedLivePurchaseIdempotencyKey } from "@/lib/live-purchase-idempotency";

describe("scopedLivePurchaseIdempotencyKey", () => {
  const header = "lv_purchase_cmw2p9dyp000a0ajvtf2t74ro_59794482";

  it("gives two buyers in the same 30-second window different keys", () => {
    const a = scopedLivePurchaseIdempotencyKey("buyer-a", header);
    const b = scopedLivePurchaseIdempotencyKey("buyer-b", header);
    expect(a).not.toBe(b);
  });

  it("keeps a buyer's own retries on the same key", () => {
    expect(scopedLivePurchaseIdempotencyKey("buyer-a", header)).toBe(scopedLivePurchaseIdempotencyKey("buyer-a", ` ${header} `));
  });

  it("returns null without a header", () => {
    expect(scopedLivePurchaseIdempotencyKey("buyer-a", null)).toBeNull();
    expect(scopedLivePurchaseIdempotencyKey("buyer-a", "  ")).toBeNull();
  });
});
