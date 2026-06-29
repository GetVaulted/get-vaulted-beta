export type TimelineStepState = "complete" | "current" | "upcoming";

export type OrderTimelineStep = {
  key: string;
  title: string;
  detail: string;
  state: TimelineStepState;
};

type BuyerArgs = {
  listingBuyingFormat: "auction" | "buy_now";
  paymentStatus: string;
  orderStatus: string;
  fulfillmentStatus: string;
  trackingNumber: string | null;
  labelUrl: string | null;
  shippoTransactionId: string | null;
};

/**
 * One highlighted "current" step: payment → fulfillment chain after paid.
 */
export function buildBuyerOrderTimeline(a: BuyerArgs): OrderTimelineStep[] {
  const paid = a.paymentStatus === "paid";
  const expired = a.paymentStatus === "expired";
  const failed = a.paymentStatus === "failed";
  const requiresAction = a.paymentStatus === "payment_requires_action";
  const pendingPay = a.paymentStatus === "pending_payment" || failed || requiresAction;

  const hasLabel = Boolean(a.labelUrl || a.shippoTransactionId);
  const delivered = a.fulfillmentStatus === "delivered";
  const outForDelivery = a.fulfillmentStatus === "out_for_delivery";
  const sellerShipped = a.fulfillmentStatus === "shipped" || a.orderStatus === "shipped";
  const inTransit = a.fulfillmentStatus === "in_transit" || a.fulfillmentStatus === "out_for_delivery";

  const steps: OrderTimelineStep[] = [];

  if (a.listingBuyingFormat === "auction") {
    steps.push({
      key: "auction_won",
      title: "Auction won",
      detail: expired ? "This order closed without payment in time." : "You won this listing.",
      state: "complete",
    });
  }

  steps.push({
    key: "payment",
    title: a.listingBuyingFormat === "auction" ? "Pay for your win" : "Complete payment",
    detail: expired
      ? "The payment window expired."
      : paid
        ? "Payment completed successfully."
        : failed
          ? "Payment did not go through — try Pay now again."
          : requiresAction
            ? "Complete card authentication to finish payment."
            : "Finish checkout to confirm your purchase.",
    state: "upcoming",
  });

  steps.push({
    key: "paid",
    title: "Paid & confirmed",
    detail: paid ? "The seller will prepare shipment." : "Seller is notified after payment clears.",
    state: "upcoming",
  });

  steps.push({
    key: "label",
    title: "Label created",
    detail: hasLabel ? "A shipping label exists for this order." : "Waiting for the seller to buy or attach a label.",
    state: "upcoming",
  });

  steps.push({
    key: "transit",
    title: inTransit ? "On the way" : sellerShipped ? "Shipped" : "On the way",
    detail: inTransit
      ? "Carrier is moving your package."
      : sellerShipped
        ? "Seller shipped your package. You'll see an update when the carrier scans it in."
        : "Tracking updates appear here after the carrier scans your package.",
    state: "upcoming",
  });

  steps.push({
    key: "out_for_delivery",
    title: "Out for delivery",
    detail: outForDelivery
      ? "Your package is on the delivery truck today."
      : "You'll see an update when the carrier is close.",
    state: "upcoming",
  });

  steps.push({
    key: "delivered",
    title: "Delivered",
    detail: delivered ? "Carrier reported delivery." : "You'll see an update when the package arrives.",
    state: "upcoming",
  });

  const payIdx = a.listingBuyingFormat === "auction" ? 1 : 0;
  const paidIdx = payIdx + 1;
  const labelIdx = paidIdx + 1;
  const transitIdx = labelIdx + 1;
  const outForDeliveryIdx = transitIdx + 1;
  const deliveredIdx = outForDeliveryIdx + 1;

  const setComplete = (from: number, to: number) => {
    if (to < from) return;
    for (let i = from; i <= to; i++) {
      if (steps[i]) steps[i]!.state = "complete";
    }
  };

  if (expired) {
    setComplete(0, payIdx - 1);
    steps[payIdx]!.state = "current";
  } else if (!paid) {
    setComplete(0, payIdx - 1);
    steps[payIdx]!.state = "current";
  } else {
    if (delivered) {
      setComplete(0, deliveredIdx);
    } else if (outForDelivery) {
      setComplete(0, transitIdx);
      steps[outForDeliveryIdx]!.state = "current";
    } else if (inTransit) {
      setComplete(0, labelIdx);
      steps[transitIdx]!.state = "current";
    } else if (sellerShipped) {
      setComplete(0, labelIdx);
      steps[transitIdx]!.state = "current";
    } else if (hasLabel) {
      setComplete(0, paidIdx);
      steps[labelIdx]!.state = "current";
    } else {
      setComplete(0, paidIdx);
      steps[labelIdx]!.state = "current";
    }
  }

  return steps;
}

export type SellerCommerceRow = { id: string; title: string; body: string; createdAt: Date };

type SellerArgs = {
  paymentStatus: string;
  fulfillmentStatus: string;
  orderStatus: string;
  trackingNumber: string | null;
  labelUrl: string | null;
  shippoTransactionId: string | null;
};

export type SellerMilestone = {
  key: string;
  title: string;
  detail: string;
  state: TimelineStepState;
};

export function buildSellerOrderMilestones(a: SellerArgs): SellerMilestone[] {
  const paid = a.paymentStatus === "paid";
  const pendingPay =
    a.paymentStatus === "pending_payment" || a.paymentStatus === "payment_requires_action";
  const expired = a.paymentStatus === "expired";
  const hasLabel = Boolean(a.labelUrl || a.shippoTransactionId);
  const delivered = a.fulfillmentStatus === "delivered";
  const outForDelivery = a.fulfillmentStatus === "out_for_delivery";
  const sellerShipped = a.fulfillmentStatus === "shipped" || a.orderStatus === "shipped";
  const inTransit = a.fulfillmentStatus === "in_transit" || a.fulfillmentStatus === "out_for_delivery";

  const milestones: SellerMilestone[] = [
    {
      key: "opened",
      title: pendingPay ? "Awaiting buyer payment" : "Order opened",
      detail: pendingPay ? "The buyer must pay within the deadline." : "Buyer placed this order.",
      state: "upcoming",
    },
    {
      key: "paid",
      title: "Payment received",
      detail: expired ? "Buyer did not pay in time." : paid ? "You can fulfill and ship." : "Waiting on payment.",
      state: "upcoming",
    },
    {
      key: "fulfill",
      title: "Ready to ship",
      detail: paid ? "Create a label from Sales or mark shipped when you send." : "Unlocks after payment.",
      state: "upcoming",
    },
    {
      key: "label",
      title: "Label & tracking",
      detail: hasLabel ? "Label purchased — carrier updates may flow in automatically." : "No label on file yet.",
      state: "upcoming",
    },
    {
      key: "transit",
      title: inTransit ? "On the way" : sellerShipped ? "Shipped" : "On the way",
      detail: inTransit
        ? "Carrier is moving the package."
        : sellerShipped
          ? "Waiting for carrier to scan the package in."
          : "Carrier movement after first scan.",
      state: "upcoming",
    },
    {
      key: "out_for_delivery",
      title: "Out for delivery",
      detail: outForDelivery ? "Carrier reports delivery today." : "Final mile delivery.",
      state: "upcoming",
    },
    {
      key: "delivered",
      title: "Delivered",
      detail: delivered ? "Carrier reported delivered." : "Pending final delivery scan.",
      state: "upcoming",
    },
  ];

  const i0 = 0;
  const i1 = 1;
  const i2 = 2;
  const i3 = 3;
  const i4 = 4;
  const i5 = 5;
  const i6 = 6;

  if (expired) {
    milestones[i0]!.state = "complete";
    milestones[i1]!.state = "current";
  } else if (!paid) {
    milestones[i0]!.state = "current";
  } else {
    milestones[i0]!.state = "complete";
    milestones[i1]!.state = "complete";
    if (delivered) {
      milestones[i2]!.state = "complete";
      milestones[i3]!.state = "complete";
      milestones[i4]!.state = "complete";
      milestones[i5]!.state = "complete";
      milestones[i6]!.state = "complete";
    } else if (outForDelivery) {
      milestones[i2]!.state = "complete";
      milestones[i3]!.state = "complete";
      milestones[i4]!.state = "complete";
      milestones[i5]!.state = "current";
    } else if (inTransit) {
      milestones[i2]!.state = "complete";
      milestones[i3]!.state = "complete";
      milestones[i4]!.state = "current";
    } else if (sellerShipped) {
      milestones[i2]!.state = "complete";
      milestones[i3]!.state = "complete";
      milestones[i4]!.state = "current";
    } else if (hasLabel) {
      milestones[i2]!.state = "complete";
      milestones[i3]!.state = "current";
    } else {
      milestones[i2]!.state = "current";
    }
  }

  return milestones;
}

/** Compact seller timeline: Ordered → Paid → Label → In transit → Delivered */
export function buildSellerFulfillmentTimelineCompact(a: SellerArgs): SellerMilestone[] {
  const paid = a.paymentStatus === "paid";
  const pendingPay =
    a.paymentStatus === "pending_payment" || a.paymentStatus === "payment_requires_action";
  const hasLabel = Boolean(a.labelUrl || a.shippoTransactionId);
  const delivered = a.fulfillmentStatus === "delivered";
  const sellerShipped = a.fulfillmentStatus === "shipped" || a.orderStatus === "shipped";
  const inTransit = a.fulfillmentStatus === "in_transit" || a.fulfillmentStatus === "out_for_delivery";

  const steps: SellerMilestone[] = [
    { key: "ordered", title: "Ordered", detail: "Buyer placed order", state: "upcoming" },
    {
      key: "paid",
      title: "Paid",
      detail: paid ? "Payment received" : pendingPay ? "Awaiting payment" : "Payment pending",
      state: "upcoming",
    },
    {
      key: "label",
      title: "Label created",
      detail: hasLabel ? "Print label and mark shipped" : "No label yet",
      state: "upcoming",
    },
    {
      key: "transit",
      title: inTransit ? "On the way" : sellerShipped ? "Shipped" : "On the way",
      detail: inTransit
        ? "Carrier scanned the package in"
        : sellerShipped
          ? "Awaiting carrier scan"
          : "Updates after carrier scan",
      state: "upcoming",
    },
    {
      key: "delivered",
      title: "Delivered",
      detail: delivered ? "Delivery confirmed" : "Awaiting delivery",
      state: "upcoming",
    },
  ];

  steps[0]!.state = "complete";
  if (!paid) {
    steps[1]!.state = pendingPay ? "current" : "upcoming";
    return steps;
  }
  steps[1]!.state = "complete";
  if (delivered) {
    steps[2]!.state = "complete";
    steps[3]!.state = "complete";
    steps[4]!.state = "complete";
    return steps;
  }
  if (inTransit) {
    steps[2]!.state = "complete";
    steps[3]!.state = "current";
    return steps;
  }
  if (sellerShipped) {
    steps[2]!.state = "complete";
    steps[3]!.state = "current";
    return steps;
  }
  if (hasLabel) {
    steps[2]!.state = "current";
    return steps;
  }
  steps[2]!.state = "current";
  return steps;
}
