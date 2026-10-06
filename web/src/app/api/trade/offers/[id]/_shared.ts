import type { Prisma } from "@/generated/prisma/client";
import { TRADE_ACTIVE_STATUSES, expireOfferIfNeeded, isTradeListingAvailableStatus } from "@/lib/trade-offers";

type ListingRow = {
  id: string;
  title: string;
  category: string;
  condition: string;
  priceUsd: number;
  status: string;
  acceptTradeOffers: boolean;
  sellerId: string;
  images: Array<{ url: string; id: string; listingId: string; sortOrder: number }>;
};

export async function resolveTradeListingsForTerms(
  tx: Prisma.TransactionClient,
  requestedListingIds: string[],
  offeredListingIds: string[],
  proposerId: string,
): Promise<
  | { error: string; status: number }
  | { requestedRows: ListingRow[]; offeredRows: ListingRow[]; recipientId: string }
> {
  if (requestedListingIds.length < 1 || requestedListingIds.length > 5) {
    return { error: "Requested items must be between 1 and 5.", status: 400 };
  }
  if (offeredListingIds.length < 1 || offeredListingIds.length > 5) {
    return { error: "Offered items must be between 1 and 5.", status: 400 };
  }
  const allIds = Array.from(new Set([...requestedListingIds, ...offeredListingIds]));
  const rows = await tx.listing.findMany({
    where: { id: { in: allIds } },
    include: { images: { orderBy: { sortOrder: "asc" }, take: 1 } },
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  const requestedRows = requestedListingIds
    .map((id) => byId.get(id))
    .filter((v) => Boolean(v)) as ListingRow[];
  const offeredRows = offeredListingIds
    .map((id) => byId.get(id))
    .filter((v) => Boolean(v)) as ListingRow[];
  if (requestedRows.length !== requestedListingIds.length || offeredRows.length !== offeredListingIds.length) {
    return { error: "One or more selected items were not found.", status: 400 };
  }
  const requestedOwnerIds = new Set(requestedRows.map((l) => l.sellerId));
  if (requestedOwnerIds.size !== 1) {
    return { error: "Requested items must belong to one seller.", status: 400 };
  }
  const recipientId = requestedRows[0].sellerId;
  if (recipientId === proposerId) {
    return { error: "You cannot create a trade with yourself.", status: 400 };
  }
  if (offeredRows.some((l) => l.sellerId !== proposerId)) {
    return { error: "You can only offer your own listings.", status: 400 };
  }
  if (requestedRows.some((l) => l.sellerId === proposerId)) {
    return { error: "Requested items cannot be your own listings.", status: 400 };
  }
  if (requestedRows.some((l) => !l.acceptTradeOffers || !isTradeListingAvailableStatus(l.status))) {
    return { error: "Requested items must be trade-enabled and available.", status: 400 };
  }
  if (offeredRows.some((l) => !isTradeListingAvailableStatus(l.status))) {
    return { error: "Offered items must be available.", status: 400 };
  }
  return { requestedRows, offeredRows, recipientId };
}

export async function ensureOfferFreshForAction(
  tx: Prisma.TransactionClient,
  offer: { id: string; status: "pending" | "countered" | "accepted" | "completed" | "disputed" | "declined" | "cancelled" | "expired"; expiresAt: Date | null },
): Promise<"pending" | "countered" | "accepted" | "completed" | "disputed" | "declined" | "cancelled" | "expired"> {
  return expireOfferIfNeeded(tx, offer);
}

export function assertActiveForMutation(status: string): { ok: true } | { ok: false; error: string; code: number } {
  if (!TRADE_ACTIVE_STATUSES.includes(status as "pending" | "countered")) {
    return { ok: false, error: "This offer is no longer active.", code: 409 };
  }
  return { ok: true };
}
