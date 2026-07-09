import { createNotification, type NotificationDb } from "@/lib/notifications";

function tradeOfferHref(offerId: string): string {
  return `/trade/${encodeURIComponent(offerId)}`;
}

function trimListingTitle(title: string, max = 90): string {
  const t = title.trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function atUsername(username: string | null | undefined): string {
  const u = username?.trim();
  return u ? `@${u}` : "A collector";
}

export async function notifyTradeOfferCreated(
  db: NotificationDb,
  args: {
    offerId: string;
    recipientId: string;
    proposerUsername: string | null;
    requestedTitle: string;
    offeredCount: number;
  },
): Promise<void> {
  const who = atUsername(args.proposerUsername);
  const requested = trimListingTitle(args.requestedTitle);
  const offered = args.offeredCount === 1 ? "1 item" : `${args.offeredCount} items`;
  await createNotification(db, {
    userId: args.recipientId,
    type: "trade_offer_received",
    title: "New trade offer",
    body: `${who} offered ${offered} for your “${requested}”.`,
    href: tradeOfferHref(args.offerId),
  });
}

export async function notifyTradeOfferCountered(
  db: NotificationDb,
  args: {
    offerId: string;
    recipientUserId: string;
    actorUsername: string | null;
  },
): Promise<void> {
  await createNotification(db, {
    userId: args.recipientUserId,
    type: "trade_offer_countered",
    title: "Trade counter received",
    body: `${atUsername(args.actorUsername)} sent a counter on your trade offer.`,
    href: tradeOfferHref(args.offerId),
  });
}

export async function notifyTradeOfferAccepted(
  db: NotificationDb,
  args: {
    offerId: string;
    proposerId: string;
    actorUsername: string | null;
  },
): Promise<void> {
  await createNotification(db, {
    userId: args.proposerId,
    type: "trade_offer_accepted",
    title: "Trade offer accepted",
    body: `${atUsername(args.actorUsername)} accepted your trade offer.`,
    href: tradeOfferHref(args.offerId),
  });
}

export async function notifyTradeOfferDeclined(
  db: NotificationDb,
  args: {
    offerId: string;
    proposerId: string;
    actorUsername: string | null;
  },
): Promise<void> {
  await createNotification(db, {
    userId: args.proposerId,
    type: "trade_offer_declined",
    title: "Trade offer declined",
    body: `${atUsername(args.actorUsername)} declined your trade offer.`,
    href: tradeOfferHref(args.offerId),
  });
}

export async function notifyTradeOfferCancelled(
  db: NotificationDb,
  args: {
    offerId: string;
    recipientId: string;
    actorUsername: string | null;
  },
): Promise<void> {
  await createNotification(db, {
    userId: args.recipientId,
    type: "trade_offer_cancelled",
    title: "Trade offer cancelled",
    body: `${atUsername(args.actorUsername)} cancelled their trade offer.`,
    href: tradeOfferHref(args.offerId),
  });
}
