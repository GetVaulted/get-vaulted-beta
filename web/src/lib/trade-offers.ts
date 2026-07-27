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

/** Who pays / receives optional trade cash (one direction only). */
export function resolveTradeCashParties(args: {
  proposerId: string;
  recipientId: string;
  proposerCashUsd: number;
  recipientCashUsd: number;
}): { amountUsd: number; payerUserId: string; payeeUserId: string } | null {
  const proposerCash = Math.max(0, Number(args.proposerCashUsd) || 0);
  const recipientCash = Math.max(0, Number(args.recipientCashUsd) || 0);
  if (proposerCash > 0 && recipientCash <= 0) {
    return {
      amountUsd: proposerCash,
      payerUserId: args.proposerId,
      payeeUserId: args.recipientId,
    };
  }
  if (recipientCash > 0 && proposerCash <= 0) {
    return {
      amountUsd: recipientCash,
      payerUserId: args.recipientId,
      payeeUserId: args.proposerId,
    };
  }
  return null;
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
  if (type === "platform_fee_paid") {
    const amount = typeof obj.amountUsd === "number" ? obj.amountUsd : 2.99;
    const shippingCents = typeof obj.shippingChargedCents === "number" ? obj.shippingChargedCents : null;
    if (shippingCents != null && shippingCents > 0) {
      return `Platform fee + shipping paid · $${amount.toFixed(2)} fee + $${(shippingCents / 100).toFixed(2)} label`;
    }
    return `Platform fee paid · $${amount.toFixed(2)}`;
  }
  if (type === "cash_paid") {
    const amount = typeof obj.amountUsd === "number" ? obj.amountUsd : null;
    return amount != null ? `Trade cash paid · $${amount.toFixed(2)}` : "Trade cash paid";
  }
  if (type === "shipping_label_purchased") {
    const tracking = typeof obj.trackingNumber === "string" ? obj.trackingNumber : null;
    return tracking ? `Shipping label purchased · ${tracking}` : "Shipping label purchased";
  }
  if (type === "shipping_label_failed") {
    const err = typeof obj.error === "string" ? obj.error : null;
    return err ? `Label purchase failed · ${err}` : "Label purchase failed";
  }
  if (type === "party_shipped") {
    const tracking = typeof obj.trackingNumber === "string" ? obj.trackingNumber : null;
    return tracking ? `Marked shipped · ${tracking}` : "Marked shipped";
  }
  if (type === "party_received") return "Confirmed receipt of partner package";
  if (type === "offer_completed") return "Trade completed — both sides confirmed receipt";
  if (type === "dispute_opened") {
    const reason = typeof obj.reason === "string" ? obj.reason : null;
    return reason ? `Dispute opened · ${reason}` : "Dispute opened";
  }
  if (type === "cash_released") {
    const amount = typeof obj.amountUsd === "number" ? obj.amountUsd : null;
    return amount != null ? `Trade cash released · $${amount.toFixed(2)}` : "Trade cash released";
  }
  if (type === "cash_refunded") {
    const amount = typeof obj.amountUsd === "number" ? obj.amountUsd : null;
    return amount != null ? `Trade cash refunded · $${amount.toFixed(2)}` : "Trade cash refunded";
  }
  if (type === "dispute_resolved") {
    const action = typeof obj.action === "string" ? obj.action : null;
    return action ? `Dispute resolved · ${action.replace(/_/g, " ")}` : "Dispute resolved";
  }
  if (type === "deposit_paid") {
    const amount = typeof obj.amountUsd === "number" ? obj.amountUsd : null;
    return amount != null
      ? `Security deposit paid · $${amount.toFixed(2)} (refundable)`
      : "Security deposit paid (refundable)";
  }
  if (type === "deposit_refunded") {
    const amount = typeof obj.amountUsd === "number" ? obj.amountUsd : null;
    return amount != null
      ? `Security deposit refunded · $${amount.toFixed(2)}`
      : "Security deposit refunded";
  }

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
