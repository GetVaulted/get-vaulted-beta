/** Stable `Notification.type` values used across the app (subset for UI grouping). */
export type NotificationLane = "buying" | "selling" | "other";

const BUYING_TYPES = new Set<string>([
  "auction_outbid",
  "auction_won",
  "purchase_complete",
  "order_payment_required",
  "order_shipped",
  "order_label_created",
  "order_in_transit",
  "order_out_for_delivery",
  "order_delivered",
  "auction_payment_expired",
  "offer_accepted",
  "offer_received",
  "counteroffer_received",
  "offer_declined",
  "trade_offer_received",
  "trade_offer_countered",
  "trade_offer_accepted",
  "trade_offer_declined",
  "trade_offer_cancelled",
  "break_spot_paid",
  "break_ready",
  "message_received",
  "message_requested",
  "chat_mention",
  "layaway_started",
  "layaway_reminder",
  "layaway_final_warning",
  "layaway_completed",
  "layaway_defaulted",
  "layaway_payment",
]);

const SELLING_TYPES = new Set<string>([
  "auction_pending_payment",
  "auction_payment_expired_seller",
  "item_sold",
  "seller_ready_to_ship",
  "seller_label_created",
  "seller_order_delivered",
  "stripe_dispute",
  "stripe_connect_action_required",
  "layaway_started_seller",
  "layaway_completed_seller",
  "layaway_defaulted_seller",
  "layaway_payment_seller",
]);

export function notificationLane(type: string): NotificationLane {
  if (BUYING_TYPES.has(type)) return "buying";
  if (SELLING_TYPES.has(type)) return "selling";
  return "other";
}

export function notificationLaneLabel(lane: NotificationLane): string {
  if (lane === "buying") return "Buying";
  if (lane === "selling") return "Selling";
  return "Account";
}

/** Short label for chips / filters (maps legacy + new types). */
export function notificationTypeChip(type: string): string {
  const map: Record<string, string> = {
    auction_outbid: "Outbid",
    auction_won: "Auction won",
    auction_pending_payment: "Payment pending",
    auction_payment_expired: "Payment expired",
    auction_payment_expired_seller: "Winner unpaid",
    purchase_complete: "Paid",
    order_payment_required: "Pay now",
    order_shipped: "Shipped",
    order_label_created: "Label created",
    order_in_transit: "In transit",
    order_out_for_delivery: "Out for delivery",
    order_delivered: "Delivered",
    item_sold: "Sold",
    seller_ready_to_ship: "Ready to ship",
    seller_label_created: "Label created",
    seller_order_delivered: "Delivered",
    offer_accepted: "Offer accepted",
    offer_received: "Offer",
    counteroffer_received: "Counter",
    offer_declined: "Declined",
    trade_offer_received: "Trade offer",
    trade_offer_countered: "Trade counter",
    trade_offer_accepted: "Trade accepted",
    trade_offer_declined: "Trade declined",
    trade_offer_cancelled: "Trade cancelled",
    break_spot_paid: "Break",
    break_ready: "Break",
    message_received: "Message",
    message_requested: "Message request",
    chat_mention: "Mention",
    stripe_dispute: "Dispute",
    stripe_connect_action_required: "Stripe setup",
    layaway_started: "Layaway",
    layaway_reminder: "Layaway",
    layaway_final_warning: "Layaway due",
    layaway_completed: "Layaway paid",
    layaway_defaulted: "Layaway expired",
    layaway_payment: "Layaway payment",
    layaway_started_seller: "On layaway",
    layaway_completed_seller: "Layaway done",
    layaway_defaulted_seller: "Layaway expired",
    layaway_payment_seller: "Layaway payment",
    admin_announcement: "Announcement",
    new_follower: "New follower",
  };
  return map[type] ?? type.replace(/_/g, " ");
}
