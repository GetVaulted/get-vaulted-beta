import type { PrismaClient } from "@/generated/prisma/client";
import { createNotification } from "@/lib/notifications";

export async function notifyAuctionOutbid(
  prisma: PrismaClient,
  args: {
    outbidUserId: string;
    amountUsd: number;
    title: string;
    href: string;
  },
): Promise<void> {
  const high = args.amountUsd.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
  const lt = args.title.length > 80 ? `${args.title.slice(0, 77)}…` : args.title;
  await createNotification(prisma, {
    userId: args.outbidUserId,
    type: "auction_outbid",
    title: "You've been outbid",
    body: `Someone bid ${high} on “${lt}”.`,
    href: args.href,
  });
}
