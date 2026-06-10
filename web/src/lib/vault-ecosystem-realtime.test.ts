import { describe, expect, it } from "vitest";
import {
  buildVaultEcosystemEvent,
  isLayawayEcosystemEventType,
  isListingEcosystemEventType,
  isOrderEcosystemEventType,
} from "@/lib/vault-ecosystem-realtime";
import { RT_EVENT, vaultEcosystemChannel } from "@/lib/realtime-channels";

describe("vault-ecosystem-realtime", () => {
  it("builds canonical envelope", () => {
    const event = buildVaultEcosystemEvent({
      type: "layaway_payment_made",
      entityId: "lay_1",
      sellerId: "seller_1",
      buyerId: "buyer_1",
      payload: { remainingBalanceUsd: 100 },
      timestamp: "2026-06-07T12:00:00.000Z",
    });
    expect(event).toEqual({
      type: "layaway_payment_made",
      entityId: "lay_1",
      sellerId: "seller_1",
      buyerId: "buyer_1",
      timestamp: "2026-06-07T12:00:00.000Z",
      payload: { remainingBalanceUsd: 100 },
    });
  });

  it("classifies layaway, order, and listing events", () => {
    expect(isLayawayEcosystemEventType("layaway_started")).toBe(true);
    expect(isLayawayEcosystemEventType("layaway_status_changed")).toBe(true);
    expect(isOrderEcosystemEventType("order_created_from_layaway")).toBe(true);
    expect(isOrderEcosystemEventType("order_status_changed")).toBe(true);
    expect(isListingEcosystemEventType("listing_reserved_on_layaway")).toBe(true);
  });

  it("matches channel and broadcast event names", () => {
    expect(vaultEcosystemChannel("user_abc")).toBe("gv-ecosystem-user_abc");
    expect(RT_EVENT.vaultEcosystem).toBe("vault_ecosystem");
  });
});
