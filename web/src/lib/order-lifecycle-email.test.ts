import { describe, expect, it } from "vitest";
import { buildOrderLifecycleEmailContent } from "@/lib/order-lifecycle-email";

describe("buildOrderLifecycleEmailContent", () => {
  it("builds purchase confirmation with total", () => {
    const out = buildOrderLifecycleEmailContent({
      userId: "u1",
      kind: "purchase_complete",
      orderId: "ord_1",
      listingTitle: "1952 Topps Mickey Mantle",
      totalUsd: 1250,
    });
    expect(out.subject).toContain("Order confirmed");
    expect(out.subject).toContain("Mickey Mantle");
    expect(out.text).toContain("$1,250.00");
    expect(out.html).toContain("ord_1");
  });

  it("includes tracking on shipped emails", () => {
    const out = buildOrderLifecycleEmailContent({
      userId: "u1",
      kind: "order_shipped",
      orderId: "ord_2",
      listingTitle: "Vintage Rolex",
      trackingNumber: "1Z999AA10123456784",
    });
    expect(out.text).toContain("1Z999AA10123456784");
    expect(out.subject).toContain("On the way");
  });
});
