import { describe, expect, it } from "vitest";
import { resolveFinalDisplacedBidder } from "./live-bid-outbid-notify-target";

describe("resolveFinalDisplacedBidder", () => {
  it("notifies the previous leader when no proxy chain fires", () => {
    const result = resolveFinalDisplacedBidder({
      prevLeaderId: "user_a",
      bidderId: "user_new",
      proxyOutbids: [],
      finalHighUsd: 120,
    });
    expect(result).toEqual({ userId: "user_a", amountUsd: 120 });
  });

  it("returns null when there is no previous leader (first bid on the lot)", () => {
    const result = resolveFinalDisplacedBidder({
      prevLeaderId: null,
      bidderId: "user_new",
      proxyOutbids: [],
      finalHighUsd: 50,
    });
    expect(result).toBeNull();
  });

  it("returns null when the previous leader is the same as the new bidder", () => {
    const result = resolveFinalDisplacedBidder({
      prevLeaderId: "user_a",
      bidderId: "user_a",
      proxyOutbids: [],
      finalHighUsd: 50,
    });
    expect(result).toBeNull();
  });

  it("collapses a multi-hop proxy chain into a single notification for the last-displaced bidder", () => {
    // Chain: user_a (prevLeader) -> outbid by new bid from user_new -> proxy from user_b
    // outbids user_new -> proxy from user_c outbids user_b. Only user_b (displaced by the
    // final leader user_c) should be notified — not user_a or user_new.
    const result = resolveFinalDisplacedBidder({
      prevLeaderId: "user_a",
      bidderId: "user_new",
      proxyOutbids: [
        { userId: "user_new", amountUsd: 110 },
        { userId: "user_b", amountUsd: 130 },
      ],
      finalHighUsd: 150,
    });
    expect(result).toEqual({ userId: "user_b", amountUsd: 150 });
  });

  it("uses the final settled high bid amount, not the intermediate proxy amount", () => {
    const result = resolveFinalDisplacedBidder({
      prevLeaderId: "user_a",
      bidderId: "user_new",
      proxyOutbids: [{ userId: "user_new", amountUsd: 110 }],
      finalHighUsd: 250,
    });
    expect(result).toEqual({ userId: "user_new", amountUsd: 250 });
  });

  it("notifies the bidder themself if an existing proxy immediately outbids their own new bid", () => {
    const result = resolveFinalDisplacedBidder({
      prevLeaderId: "user_a",
      bidderId: "user_new",
      proxyOutbids: [{ userId: "user_new", amountUsd: 110 }],
      finalHighUsd: 110,
    });
    expect(result).toEqual({ userId: "user_new", amountUsd: 110 });
  });
});
