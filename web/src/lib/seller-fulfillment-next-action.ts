import { PAYMENT_LAYAWAY_ACTIVE } from "@/lib/layaway/constants";

/** Keep in sync with `services/payments` order paymentStatus values. */
const PAYMENT_PENDING = "pending_payment";
const PAYMENT_PAID = "paid";
const PAYMENT_EXPIRED = "expired";

export type SellerNextActionKind =
  | "connect_payouts"
  | "wait_buyer_payment"
  | "add_shipping_info"
  | "create_label"
  | "ready_to_ship"
  | "track_shipment"
  | "delivered"
  | "payment_expired"
  | "none";

export type SellerNextAction = { kind: SellerNextActionKind; label: string };

export type SellerNextActionUser = {
  stripeAccountId: string | null;
  stripeOnboardingComplete: boolean;
  shipFromName: string | null;
  shipFromStreet: string | null;
  shipFromCity: string | null;
  shipFromState: string | null;
  shipFromZip: string | null;
  shipFromCountry: string | null;
};

export type SellerNextActionOrder = {
  id: string;
  status: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  shippoTransactionId: string | null;
  labelUrl: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
};

function hasShipFrom(u: SellerNextActionUser): boolean {
  return Boolean(
    u.shipFromStreet?.trim() &&
      u.shipFromCity?.trim() &&
      u.shipFromState?.trim() &&
      u.shipFromZip?.trim() &&
      u.shipFromCountry?.trim(),
  );
}

function labelFor(kind: SellerNextActionKind): string {
  switch (kind) {
    case "connect_payouts":
      return "Connect payouts";
    case "wait_buyer_payment":
      return "Wait for buyer payment";
    case "add_shipping_info":
      return "Add shipping info";
    case "create_label":
      return "Create label";
    case "ready_to_ship":
      return "Ready to ship";
    case "track_shipment":
      return "Track shipment";
    case "delivered":
      return "Delivered";
    case "payment_expired":
      return "Payment expired";
    default:
      return "—";
  }
}

/** Primary next step for one order row (seller view). */
export function sellerNextActionForOrder(user: SellerNextActionUser, o: SellerNextActionOrder): SellerNextAction {
  if (o.paymentStatus === PAYMENT_LAYAWAY_ACTIVE) {
    return { kind: "none", label: "—" };
  }
  if (!user.stripeAccountId || !user.stripeOnboardingComplete) {
    return { kind: "connect_payouts", label: labelFor("connect_payouts") };
  }
  if (o.paymentStatus === PAYMENT_EXPIRED) {
    return { kind: "payment_expired", label: labelFor("payment_expired") };
  }
  if (o.paymentStatus === PAYMENT_PENDING) {
    return { kind: "wait_buyer_payment", label: labelFor("wait_buyer_payment") };
  }
  if (o.paymentStatus !== PAYMENT_PAID) {
    return { kind: "none", label: "—" };
  }
  if (!hasShipFrom(user)) {
    return { kind: "add_shipping_info", label: labelFor("add_shipping_info") };
  }
  const hasLabel = Boolean(o.shippoTransactionId || o.labelUrl);
  if (!hasLabel) {
    return { kind: "create_label", label: labelFor("create_label") };
  }
  if (o.status === "delivered" || o.fulfillmentStatus === "delivered") {
    return { kind: "delivered", label: labelFor("delivered") };
  }
  if (o.trackingUrl || o.trackingNumber || o.status === "shipped") {
    return { kind: "track_shipment", label: labelFor("track_shipment") };
  }
  return { kind: "ready_to_ship", label: labelFor("ready_to_ship") };
}

const ACTION_RANK: Record<SellerNextActionKind, number> = {
  connect_payouts: 0,
  wait_buyer_payment: 1,
  add_shipping_info: 2,
  create_label: 3,
  ready_to_ship: 4,
  track_shipment: 5,
  delivered: 6,
  payment_expired: 7,
  none: 99,
};

/** Pick the most urgent seller action across recent orders (hub banner). */
export function sellerPrimaryNextAction(user: SellerNextActionUser, orders: SellerNextActionOrder[]): SellerNextAction {
  if (!orders.length) return { kind: "none", label: "—" };
  let best: SellerNextAction | null = null;
  for (const o of orders) {
    const a = sellerNextActionForOrder(user, o);
    if (a.kind === "none") continue;
    if (!best || ACTION_RANK[a.kind] < ACTION_RANK[best.kind]) best = a;
  }
  return best ?? { kind: "none", label: "—" };
}
