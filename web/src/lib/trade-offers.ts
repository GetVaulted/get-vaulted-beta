import type { Prisma, TradeOfferStatus } from "@/generated/prisma/client";

export const TRADE_ACTIVE_STATUSES: TradeOfferStatus[] = ["pending", "countered"];
export const TRADE_COMPLETED_STATUSES: TradeOfferStatus[] = ["accepted", "completed"];
export const TRADE_DECLINED_EXPIRED_STATUSES: TradeOfferStatus[] = ["declined", "expired", "cancelled"];

export function isTradeListingAvailableStatus(status: string): boolean {
  return status === "active" || status === "auction_live";
}

export function summarizeCash(proposerCashUsd: number, recipientCashUsd: number): string {
  if (proposerCashUsd > 0) {
    return `Proposer adds ${formatMoney(proposerCashUsd)}`;
  }
  if (recipientCashUsd > 0) {
    return `Recipient adds ${formatMoney(recipientCashUsd)}`;
  }
  return "No cash adjustment";
}

export function formatMoney(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export function formatRelativeTradeDate(iso: string): string {
  const date = new Date(iso);
  const diff = Date.now() - date.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export async function expireOfferIfNeeded(
  prisma: Prisma.TransactionClient | Prisma.DefaultPrismaClient,
  offer: { id: string; status: TradeOfferStatus; expiresAt: Date | null },
): Promise<TradeOfferStatus> {
  if (!offer.expiresAt) return offer.status;
  if (!TRADE_ACTIVE_STATUSES.includes(offer.status)) return offer.status;
  if (offer.expiresAt.getTime() > Date.now()) return offer.status;

  const expired = await prisma.tradeOffer.updateMany({
    where: {
      id: offer.id,
      status: { in: ["pending", "countered"] },
    },
    data: { status: "expired" },
  });
  if (expired.count === 0) return "expired";
  await prisma.tradeOfferEvent.create({
    data: {
      tradeOfferId: offer.id,
      type: "offer_expired",
      actorUserId: null,
      note: JSON.stringify({ reason: "expires_at_reached", previousStatus: offer.status }),
    },
  });
  return "expired";
}
