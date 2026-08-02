import { scheduleNotifyAdmins } from "@/lib/admin/notify-admins";
import { prisma } from "@/lib/prisma";

/**
 * Alert admins that a Stripe-rail order is shipped + label-settled and needs a bank payout push.
 * Deduped per order so carrier + mark-shipped don't double-notify.
 */
export function scheduleNotifyAdminsBankPayoutReady(args: {
  orderId: string;
  sellerId: string;
  sellerUsername?: string | null;
  estimatedNetUsd?: number;
}): void {
  const handle = args.sellerUsername?.trim() || args.sellerId.slice(0, 8);
  const net =
    args.estimatedNetUsd != null && Number.isFinite(args.estimatedNetUsd)
      ? ` · ~$${args.estimatedNetUsd.toFixed(2)} net`
      : "";
  scheduleNotifyAdmins({
    type: "admin_bank_payout_ready",
    title: `Payout ready · @${handle}`,
    body: `Order ${args.orderId.slice(0, 8)}… is shipped and ready for a Stripe bank payout${net}. Push it from Admin → Bank payouts.`,
    href: `/admin/payouts?orderId=${encodeURIComponent(args.orderId)}`,
    dedupeKey: `admin_bank_payout_ready:${args.orderId}`,
  });
}

export async function loadSellerHandleForPayoutAlert(sellerId: string): Promise<string | null> {
  const u = await prisma.user.findUnique({
    where: { id: sellerId },
    select: { username: true },
  });
  return u?.username ?? null;
}
