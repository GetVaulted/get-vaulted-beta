import { describe, expect, it, vi, beforeEach } from "vitest";

const { emitVaultEcosystemEventToParties } = vi.hoisted(() => ({
  emitVaultEcosystemEventToParties: vi.fn(),
}));

vi.mock("@/lib/vault-ecosystem-realtime", () => ({
  buildVaultEcosystemEvent: (input: Record<string, unknown>) => input,
  emitVaultEcosystemEventToParties,
}));

import { emitLayawayLifecycleSync, emitOrderLifecycleSync } from "@/lib/marketplace/ecosystem-sync";

describe("marketplace ecosystem-sync", () => {
  beforeEach(() => {
    emitVaultEcosystemEventToParties.mockClear();
  });

  it("emits typed layaway event plus layaway_status_changed and listing_status_changed", () => {
    emitLayawayLifecycleSync({
      typedEvent: "layaway_paid_in_full",
      layawayId: "lay_1",
      parties: { sellerId: "seller_1", buyerId: "buyer_1" },
      listingId: "listing_1",
      orderId: "order_1",
      layawayStatus: "completed",
      listingStatus: "sold",
      orderStatus: "paid",
      paymentStatus: "paid",
    });

    const types = emitVaultEcosystemEventToParties.mock.calls.map(
      (call) => (call[0] as { type: string }).type,
    );
    expect(types).toContain("layaway_paid_in_full");
    expect(types).toContain("layaway_status_changed");
    expect(types).toContain("order_status_changed");
    expect(types).toContain("listing_status_changed");
  });

  it("emits order_updated plus order_status_changed", () => {
    emitOrderLifecycleSync({
      orderId: "order_1",
      parties: { sellerId: "seller_1", buyerId: "buyer_1" },
      listingId: "listing_1",
      orderStatus: "paid",
      paymentStatus: "paid",
      listingStatus: "sold",
    });

    const types = emitVaultEcosystemEventToParties.mock.calls.map(
      (call) => (call[0] as { type: string }).type,
    );
    expect(types).toContain("order_updated");
    expect(types).toContain("order_status_changed");
    expect(types).toContain("listing_status_changed");
  });

  it("includes canonical payload fields", () => {
    emitLayawayLifecycleSync({
      typedEvent: "layaway_payment_made",
      layawayId: "lay_1",
      parties: { sellerId: "seller_1", buyerId: "buyer_1" },
      listingId: "listing_1",
      orderId: "order_1",
      layawayStatus: "active",
      extraPayload: { remainingBalanceUsd: 75 },
    });

    const firstPayload = emitVaultEcosystemEventToParties.mock.calls[0]?.[0] as {
      payload?: Record<string, unknown>;
    };
    expect(firstPayload.payload).toMatchObject({
      listingId: "listing_1",
      layawayId: "lay_1",
      orderId: "order_1",
      sellerId: "seller_1",
      buyerId: "buyer_1",
      status: "active",
      remainingBalanceUsd: 75,
    });
  });
});
