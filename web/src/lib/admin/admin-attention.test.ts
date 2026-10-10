import { describe, expect, it } from "vitest";
import { buildAttentionItems, type AttentionCounts } from "./admin-attention";

const zero: AttentionCounts = {
  payoutsNeedReview: 0, stuckRefunds: 0, escalatedRefunds: 0, disputesOverdue: 0, disputesDueSoon: 0,
  unshippedOrders: 0, sellerApplicationsPending: 0, supportTicketsWaiting: 0, reportsOpen: 0, showsLiveNoVideo: 0,
};

describe("buildAttentionItems", () => {
  it("returns nothing when everything is clear", () => {
    expect(buildAttentionItems(zero)).toEqual([]);
  });
  it("drops zero counts and ranks critical first", () => {
    const items = buildAttentionItems({ ...zero, reportsOpen: 4, disputesDueSoon: 1, escalatedRefunds: 2 });
    expect(items.map((i) => i.key)).toEqual(["disputes_due_soon", "refunds_escalated", "reports_open"]);
    expect(items[0].severity).toBe("critical");
    expect(items[0].count).toBe(1);
  });
});
