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

type OfferTermsPayload = {
  requestedListingIds?: string[];
  offeredListingIds?: string[];
  proposerCashUsd?: number;
  recipientCashUsd?: number;
  expiresAt?: string;
};

function itemCount(ids: string[] | undefined): number {
  return Array.isArray(ids) ? ids.length : 0;
}

function formatItemCount(n: number, label: string): string {
  return `${n} ${label}${n === 1 ? "" : "s"}`;
}

function formatExpiresAt(iso: string | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return `Expires ${date.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
}

function formatOfferTerms(payload: OfferTermsPayload): string {
  const requested = itemCount(payload.requestedListingIds);
  const offered = itemCount(payload.offeredListingIds);
  const parts = [
    `${formatItemCount(offered, "item offered")} for ${formatItemCount(requested, "item requested")}`,
  ];
  const cash = summarizeCash(payload.proposerCashUsd ?? 0, payload.recipientCashUsd ?? 0);
  if (cash !== "No cash adjustment") parts.push(cash);
  const expires = formatExpiresAt(payload.expiresAt);
  if (expires) parts.push(expires);
  return parts.join(" · ");
}

function parseTradeEventPayload(note: string | null): unknown {
  if (!note?.trim()) return null;
  const trimmed = note.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return trimmed;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return trimmed;
  }
}

/** Human-readable timeline copy — hides raw JSON audit blobs from buyers/sellers. */
export function formatTradeEventNote(type: string, note: string | null): string | null {
  const payload = parseTradeEventPayload(note);
  if (payload == null) return null;
  if (typeof payload === "string") return payload.trim() || null;

  const obj = payload as Record<string, unknown>;

  if (type === "offer_created" || type === "offer_countered") {
    if (type === "offer_countered" && obj.nextTerms && typeof obj.nextTerms === "object") {
      return `Counter terms: ${formatOfferTerms(obj.nextTerms as OfferTermsPayload)}`;
    }
    return formatOfferTerms(obj as OfferTermsPayload);
  }

  if (type === "offer_accepted") {
    const ids = Array.isArray(obj.validatedListingIds) ? obj.validatedListingIds.length : 0;
    return ids > 0 ? `Trade accepted · ${formatItemCount(ids, "item")} locked in` : "Trade accepted";
  }

  if (type === "offer_declined") return "Offer declined";
  if (type === "offer_cancelled") return "Offer cancelled";
  if (type === "offer_expired") return "Offer expired";

  return null;
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
