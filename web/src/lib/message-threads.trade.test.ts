import { describe, expect, it } from "vitest";
import {
  parseTradeOfferIdFromAnchorKey,
  systemMessageBody,
  tradeAnchorKey,
} from "./message-threads";

describe("tradeAnchorKey", () => {
  it("builds and parses trade anchors", () => {
    expect(tradeAnchorKey("offer_123")).toBe("trade:offer_123");
    expect(parseTradeOfferIdFromAnchorKey("trade:offer_123")).toBe("offer_123");
    expect(parseTradeOfferIdFromAnchorKey("listing:x")).toBeNull();
  });
});

describe("systemMessageBody trade_pending", () => {
  it("keeps offer terms authoritative in chat copy", () => {
    const body = systemMessageBody("trade_pending").toLowerCase();
    expect(body).toContain("authoritative");
    expect(body).toContain("trade");
  });
});
