import { scheduleNotifyAdmins } from "@/lib/admin/notify-admins";
import { OrderPayoutStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";

/** Payout states that mean "this order is ready for (or already through) a bank payout". */
const PAYOUT_READY_STATUSES: ReadonlySet<string> = new Set([
  OrderPayoutStatus.fast_payout_ready,
  OrderPayoutStatus.label_payout_ready,
  OrderPayoutStatus.instant_payout_ready,
  OrderPayoutStatus.paid_out,
]);

/** Orders in these states never get a payout, so they must not hold the break alert back. */
const INACTIVE_ORDER_STATUSES: ReadonlySet<string> = new Set(["cancelled", "refunded"]);

export type BreakPayoutAlertResult = "no_break" | "waiting" | "notified" | "error";

export async function loadSellerHandleForPayoutAlert(sellerId: string): Promise<string | null> {
  const u = await prisma.user.findUnique({
    where: { id: sellerId },
    select: { username: true },
  });
  return u?.username ?? null;
}

/**
 * Called when a Stripe-rail order becomes ready for a bank payout. Admins no longer get one alert
 * per order: this sends a single alert per break, once EVERY paid order from that break (variant
 * spots and legacy break spots) is ready. Orders that are not part of a break send nothing — they
 * still show up in Admin → Bank payouts. Deduped per break item, so it fires once.
 *
 * Never throws: an alert problem must not break payout evaluation.
 */
export async function notifyAdminsIfBreakPayoutReady(args: {
  orderId: string;
  sellerId: string;
  sellerUsername?: string | null;
}): Promise<BreakPayoutAlertResult> {
  try {
    const purchase = await prisma.liveItemVariantPurchase.findFirst({
      where: { fulfillmentOrderId: args.orderId },
      select: { liveRoomItemId: true },
    });
    const spot = purchase
      ? null
      : await prisma.breakSpot.findFirst({
          where: { fulfillmentOrderId: args.orderId },
          select: { liveRoomItemId: true, liveRoomId: true },
        });
    const itemId = purchase?.liveRoomItemId ?? spot?.liveRoomItemId ?? null;
    if (!itemId) return "no_break";

    const [purchases, spots] = await Promise.all([
      prisma.liveItemVariantPurchase.findMany({
        where: { liveRoomItemId: itemId, paymentStatus: "paid" },
        select: { fulfillmentOrderId: true, settlementChannel: true },
      }),
      prisma.breakSpot.findMany({
        where: { liveRoomItemId: itemId, fulfillmentOrderId: { not: null } },
        select: { fulfillmentOrderId: true },
      }),
    ]);

    // A paid on-platform spot with no order yet means the break is not fully ordered/shipped.
    const awaitingOrder = purchases.some((p) => !p.fulfillmentOrderId && !p.settlementChannel);
    if (awaitingOrder) return "waiting";

    const orderIds = [
      ...new Set(
        [...purchases.map((p) => p.fulfillmentOrderId), ...spots.map((s) => s.fulfillmentOrderId)].filter(
          (id): id is string => Boolean(id),
        ),
      ),
    ];
    if (!orderIds.length) return "no_break";

    const orders = await prisma.order.findMany({
      where: { id: { in: orderIds } },
      select: { id: true, status: true, paymentStatus: true, payoutStatus: true },
    });
    const active = orders.filter(
      (o) => o.paymentStatus === "paid" && !INACTIVE_ORDER_STATUSES.has(o.status),
    );
    if (!active.length || !active.every((o) => PAYOUT_READY_STATUSES.has(o.payoutStatus))) {
      return "waiting";
    }

    const item = await prisma.liveRoomItem.findUnique({
      where: { id: itemId },
      select: { title: true },
    });
    const handle =
      args.sellerUsername?.trim() ||
      (await loadSellerHandleForPayoutAlert(args.sellerId)) ||
      args.sellerId.slice(0, 8);
    const count = active.length;

    scheduleNotifyAdmins({
      type: "admin_break_payout_ready",
      title: `Break payout ready · @${handle}`,
      body: `${item?.title?.trim() || "Break"} · all ${count} order${count === 1 ? "" : "s"} shipped and ready for a Stripe bank payout. Push them from Admin → Bank payouts.`,
      href: `/admin/payouts?orderId=${encodeURIComponent(args.orderId)}`,
      dedupeKey: `admin_break_payout_ready:${itemId}`,
    });
    return "notified";
  } catch (e) {
    console.error("[notifyAdminsIfBreakPayoutReady] failed", e);
    return "error";
  }
}
