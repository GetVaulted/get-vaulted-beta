import { describe, expect, it } from "vitest";
import { clampLiveHostLotBidAmounts } from "@/lib/live-bid-amount-clamp";

describe("clampLiveHostLotBidAmounts", () => {
  it("clamps hold-to-bid when client still has prior-unit next-min floor", () => {
    const r = clampLiveHostLotBidAmounts({
      amountUsd: 8,
      maxProxyUsd: 8,
      minBidUsd: 2,
    });
    expect(r).toEqual({ amountUsd: 2, maxProxyUsd: 2 });
  });

  it("leaves a correct hold-to-bid alone", () => {
    const r = clampLiveHostLotBidAmounts({
      amountUsd: 2,
      maxProxyUsd: 2,
      minBidUsd: 2,
    });
    expect(r).toEqual({ amountUsd: 2, maxProxyUsd: 2 });
  });

  it("allows Exact jumps when maxProxy is omitted", () => {
    const r = clampLiveHostLotBidAmounts({
      amountUsd: 8,
      maxProxyUsd: undefined,
      minBidUsd: 2,
    });
    expect(r).toEqual({ amountUsd: 8, maxProxyUsd: undefined });
  });

  it("forces Max mode visible amount to server min while keeping ceiling", () => {
    const r = clampLiveHostLotBidAmounts({
      amountUsd: 8,
      maxProxyUsd: 40,
      minBidUsd: 2,
    });
    expect(r).toEqual({ amountUsd: 2, maxProxyUsd: 40 });
  });
});
