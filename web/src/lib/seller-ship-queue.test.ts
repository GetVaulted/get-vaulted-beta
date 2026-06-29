import { describe, expect, it } from "vitest";
import {
  countShipQueueActions,
  orderIdsAwaitingBundledLabel,
  sellerShipQueuePhase,
} from "@/lib/seller-ship-queue";

describe("sellerShipQueuePhase", () => {
  it("returns needs_label for paid orders without a label", () => {
    expect(
      sellerShipQueuePhase({
        id: "o1",
        status: "paid",
        paymentStatus: "paid",
        fulfillmentStatus: "pending",
        shippoTransactionId: null,
        labelUrl: null,
        trackingNumber: null,
      }),
    ).toBe("needs_label");
  });

  it("returns print_and_ship when label exists but not shipped", () => {
    expect(
      sellerShipQueuePhase({
        id: "o1",
        status: "paid",
        paymentStatus: "paid",
        fulfillmentStatus: "label_created",
        shippoTransactionId: "tx_1",
        labelUrl: "https://example.com/label.pdf",
        trackingNumber: "1Z999",
      }),
    ).toBe("print_and_ship");
  });

  it("returns awaiting_carrier after seller marks shipped", () => {
    expect(
      sellerShipQueuePhase({
        id: "o1",
        status: "shipped",
        paymentStatus: "paid",
        fulfillmentStatus: "shipped",
        shippoTransactionId: "tx_1",
        labelUrl: "https://example.com/label.pdf",
        trackingNumber: "1Z999",
      }),
    ).toBe("awaiting_carrier");
  });

  it("returns in_transit after carrier scan", () => {
    expect(
      sellerShipQueuePhase({
        id: "o1",
        status: "shipped",
        paymentStatus: "paid",
        fulfillmentStatus: "in_transit",
        shippoTransactionId: "tx_1",
        labelUrl: "https://example.com/label.pdf",
        trackingNumber: "1Z999",
      }),
    ).toBe("in_transit");
  });
});

describe("orderIdsAwaitingBundledLabel", () => {
  it("collects paid unlabeled orders in bundled sessions", () => {
    const ids = orderIdsAwaitingBundledLabel([
      {
        bundled: true,
        canCreateBundledLabel: true,
        orders: [
          { id: "a", shipAlone: false, paymentStatus: "paid", hasLabel: false },
          { id: "b", shipAlone: true, paymentStatus: "paid", hasLabel: false },
        ],
      },
    ]);
    expect([...ids]).toEqual(["a"]);
  });
});

describe("countShipQueueActions", () => {
  it("skips orders covered by pending bundle labels", () => {
    const counts = countShipQueueActions(
      [
        {
          id: "a",
          status: "paid",
          paymentStatus: "paid",
          fulfillmentStatus: "pending",
          shippoTransactionId: null,
          labelUrl: null,
          trackingNumber: null,
        },
        {
          id: "b",
          status: "paid",
          paymentStatus: "paid",
          fulfillmentStatus: "pending",
          shippoTransactionId: null,
          labelUrl: null,
          trackingNumber: null,
        },
      ],
      { skipOrderIds: new Set(["a"]) },
    );
    expect(counts.needsLabel).toBe(1);
  });
});
