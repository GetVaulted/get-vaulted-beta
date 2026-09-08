import { OrderPayoutStatus } from "@/generated/prisma/enums";
import { scheduleNotifyAdmins } from "@/lib/admin/notify-admins";
import { prisma } from "@/lib/prisma";

/**
 * Alert admins that a seller has at least one Stripe-rail order shipped + label-settled and
 * ready for a bank payout push. Fired once per seller *batch* (see the caller in
 * process-payout-tier-events.ts, which only calls this for the first order of a fresh batch) —
 * intentionally NOT once per order/item, so a seller shipping 20 items from one live show
 * produces a single alert, not 20.
 *
 * `dedupeKey` is still order-scoped (belt-and-suspenders against the same order re-triggering
 * this function twice), but the batching happens at the call site.
 */
async function notifyAdminsBankPayoutReady(args: {
  orderId: string;
  sellerId: string;
  sellerUsername?: string | null;
  estimatedNetUsd?: number;
}): Promise<void> {
  const handle = args.sellerUsername?.trim() || args.sellerId.slice(0, 8);

  const readyOrders = await prisma.order.findMany({
    where: { sellerId: args.sellerId, payoutStatus: OrderPayoutStatus.fast_payout_ready },
    select: { totalUsd: true },
  });
  const orderCount = Math.max(readyOrders.length, 1);
  const totalNet =
    orderCount > 1
      ? null // Multiple orders' true net (after fees/reserve) isn't summed here — keep the count, skip a misleading total.
      : args.estimatedNetUsd;

  const netSuffix =
    totalNet != null && Number.isFinite(totalNet) ? ` · ~$${totalNet.toFixed(2)} net` : "";
  const itemWord = orderCount === 1 ? "order" : "orders";

  scheduleNotifyAdmins({
    type: "admin_bank_payout_ready",
    title: `Payout ready · @${handle}`,
    body: `@${handle} has ${orderCount} ${itemWord} shipped and ready for a Stripe bank payout${netSuffix}. Push it from Admin → Bank payouts.`,
    href: `/admin/payouts?sellerId=${encodeURIComponent(args.sellerId)}`,
    dedupeKey: `admin_bank_payout_ready:${args.orderId}`,
  });
}

/** Fire-and-forget wrapper — never throws to the caller (order status update must not fail). */
export function scheduleNotifyAdminsBankPayoutReady(args: {
  orderId: string;
  sellerId: string;
  sellerUsername?: string | null;
  estimatedNetUsd?: number;
}): void {
  void notifyAdminsBankPayoutReady(args).catch((e) => {
    console.error("[notifyAdminsBankPayoutReady] failed", e);
  });
}

export async function loadSellerHandleForPayoutAlert(sellerId: string): Promise<string | null> {
  const u = await prisma.user.findUnique({
    where: { id: sellerId },
    select: { username: true },
  });
  return u?.username ?? null;
}
