export const ORDER_STATUSES = ["pending", "paid", "shipped", "delivered", "cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export function isOrderStatus(s: string): s is OrderStatus {
  return (ORDER_STATUSES as readonly string[]).includes(s);
}

export function orderStatusLabel(s: string): string {
  const labels: Record<string, string> = {
    pending: "Pending",
    paid: "Paid",
    shipped: "Shipped",
    delivered: "Delivered",
    cancelled: "Cancelled",
  };
  return labels[s] ?? s;
}

export function orderStatusTone(s: string): string {
  if (s === "paid") return "border-sky-400/25 bg-sky-500/10 text-sky-100/95";
  if (s === "shipped") return "border-amber-400/25 bg-amber-950/35 text-amber-100/90";
  if (s === "delivered") return "border-emerald-400/25 bg-emerald-500/10 text-emerald-100/95";
  if (s === "cancelled") return "border-zinc-500/25 bg-zinc-800/50 text-zinc-300";
  return "border-zinc-500/25 bg-zinc-800/40 text-zinc-300";
}
