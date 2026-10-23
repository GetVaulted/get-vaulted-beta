/** Orders at or above this item price are checked (USD). */
export const RISK_MIN_ORDER_USD = 200;
/** A buyer account younger than this (at order time) counts as "new". */
export const RISK_NEW_ACCOUNT_DAYS = 14;

export type RiskFlag = "new_account_big_order" | "shared_address_big_order";

export const RISK_FLAG_LABEL: Record<RiskFlag, string> = {
  new_account_big_order: "New account, big order",
  shared_address_big_order: "Same address on another account",
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Pure rule check for one order. `sharedAddress` = the ship-to address also appears on a different buyer account. */
export function evaluateOrderRisk(args: {
  buyerCreatedAt: Date;
  orderCreatedAt: Date;
  itemPriceUsd: number;
  sharedAddress: boolean;
  minUsd?: number;
  newAccountDays?: number;
}): RiskFlag[] {
  const minUsd = args.minUsd ?? RISK_MIN_ORDER_USD;
  const newDays = args.newAccountDays ?? RISK_NEW_ACCOUNT_DAYS;
  if (!(args.itemPriceUsd >= minUsd)) return [];
  const flags: RiskFlag[] = [];
  const ageMs = args.orderCreatedAt.getTime() - args.buyerCreatedAt.getTime();
  if (ageMs < newDays * DAY_MS) flags.push("new_account_big_order");
  if (args.sharedAddress) flags.push("shared_address_big_order");
  return flags;
}

/** Normalised ship-to key so "12327 Seward St." and "12327 seward st" match. Empty when too short to trust. */
export function addressKey(address: string | null | undefined, zip: string | null | undefined): string {
  const a = (address ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const z = (zip ?? "").replace(/[^0-9]/g, "").slice(0, 5);
  return a.length >= 6 && z.length >= 5 ? `${a}|${z}` : "";
}

const DEAD_STATUSES = new Set(["cancelled", "failed", "refunded"]);

/** An order that could still turn into money or goods leaving: paid, shipped, or waiting on payment. */
export function isLiveRiskOrder(o: { paymentStatus: string; status: string }): boolean {
  return o.paymentStatus === "paid" || (!DEAD_STATUSES.has(o.status) && o.paymentStatus === "pending_payment");
}
