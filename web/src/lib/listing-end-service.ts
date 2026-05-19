import type {
  ListingEndReasonCategory,
  ListingEndRequestStatus,
  ListingStatus,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/notifications";

export const LISTING_END_REASON_LABELS: Record<ListingEndReasonCategory, string> = {
  item_damaged: "Item damaged",
  listing_mistake: "Listing mistake",
  inventory_unavailable: "Inventory unavailable",
  suspected_fraud: "Suspected fraud",
  shipping_issue: "Shipping issue",
  other: "Other",
};

const ENDABLE_STATUSES: ListingStatus[] = ["active", "auction_live"];

export type ListingEndRequestDto = {
  id: string;
  listingId: string;
  sellerId: string;
  status: ListingEndRequestStatus;
  reasonCategory: ListingEndReasonCategory;
  reasonText: string;
  adminNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
  reviewedById: string | null;
};

function toDto(row: {
  id: string;
  listingId: string;
  sellerId: string;
  status: ListingEndRequestStatus;
  reasonCategory: ListingEndReasonCategory;
  reasonText: string;
  adminNote: string | null;
  createdAt: Date;
  reviewedAt: Date | null;
  reviewedById: string | null;
}): ListingEndRequestDto {
  return {
    id: row.id,
    listingId: row.listingId,
    sellerId: row.sellerId,
    status: row.status,
    reasonCategory: row.reasonCategory,
    reasonText: row.reasonText,
    adminNote: row.adminNote,
    createdAt: row.createdAt.toISOString(),
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    reviewedById: row.reviewedById,
  };
}

async function writeAudit(input: {
  listingId: string;
  listingEndRequestId?: string;
  actorUserId?: string;
  action: string;
  detail?: string;
}) {
  await prisma.listingEndAuditLog.create({
    data: {
      listingId: input.listingId,
      listingEndRequestId: input.listingEndRequestId ?? null,
      actorUserId: input.actorUserId ?? null,
      action: input.action,
      detail: input.detail ?? "",
    },
  });
  console.info("[listing-end]", {
    listingId: input.listingId,
    action: input.action,
    actorUserId: input.actorUserId,
    detail: input.detail,
  });
}

export async function getActiveBidCount(listingId: string): Promise<number> {
  return prisma.bid.count({ where: { listingId } });
}

export async function getLatestEndRequestForListing(
  listingId: string,
): Promise<ListingEndRequestDto | null> {
  const row = await prisma.listingEndRequest.findFirst({
    where: { listingId },
    orderBy: { createdAt: "desc" },
  });
  return row ? toDto(row) : null;
}

export async function sellerEndListing(listingId: string, sellerId: string): Promise<void> {
  const listing = await prisma.listing.findFirst({
    where: { id: listingId, sellerId },
    select: { id: true, status: true, buyingFormat: true, title: true },
  });
  if (!listing) throw new Error("NOT_FOUND");
  if (!ENDABLE_STATUSES.includes(listing.status)) throw new Error("INVALID_STATUS");

  const bidCount = await getActiveBidCount(listingId);
  if (listing.buyingFormat === "auction" && bidCount > 0) {
    throw new Error("AUCTION_HAS_BIDS");
  }

  await prisma.listing.update({
    where: { id: listingId },
    data: {
      status: "ended",
      auctionEndsAt: listing.status === "auction_live" ? new Date() : undefined,
    },
  });

  await writeAudit({
    listingId,
    actorUserId: sellerId,
    action: "seller_end_listing",
    detail: JSON.stringify({ buyingFormat: listing.buyingFormat, bidCount }),
  });
}

function parseReasonCategory(v: unknown): ListingEndReasonCategory | null {
  const allowed: ListingEndReasonCategory[] = [
    "item_damaged",
    "listing_mistake",
    "inventory_unavailable",
    "suspected_fraud",
    "shipping_issue",
    "other",
  ];
  return typeof v === "string" && allowed.includes(v as ListingEndReasonCategory)
    ? (v as ListingEndReasonCategory)
    : null;
}

export async function createListingEndRequest(input: {
  listingId: string;
  sellerId: string;
  reasonCategory: ListingEndReasonCategory;
  reasonText: string;
}): Promise<ListingEndRequestDto> {
  const listing = await prisma.listing.findFirst({
    where: { id: input.listingId, sellerId: input.sellerId },
    select: { id: true, status: true, buyingFormat: true, title: true },
  });
  if (!listing) throw new Error("NOT_FOUND");
  if (listing.buyingFormat !== "auction" || listing.status !== "auction_live") {
    throw new Error("NOT_AUCTION");
  }

  const bidCount = await getActiveBidCount(input.listingId);
  if (bidCount === 0) throw new Error("NO_BIDS_USE_END");

  const existingPending = await prisma.listingEndRequest.findFirst({
    where: { listingId: input.listingId, status: "pending" },
  });
  if (existingPending) throw new Error("REQUEST_ALREADY_PENDING");

  const text = input.reasonText.trim();
  if (text.length < 10) throw new Error("REASON_TOO_SHORT");

  const row = await prisma.listingEndRequest.create({
    data: {
      listingId: input.listingId,
      sellerId: input.sellerId,
      reasonCategory: input.reasonCategory,
      reasonText: text,
    },
  });

  await writeAudit({
    listingId: input.listingId,
    listingEndRequestId: row.id,
    actorUserId: input.sellerId,
    action: "end_request_submitted",
    detail: JSON.stringify({ reasonCategory: input.reasonCategory, bidCount }),
  });

  return toDto(row);
}

export async function cancelListingEndRequestBySeller(
  requestId: string,
  sellerId: string,
): Promise<ListingEndRequestDto> {
  const row = await prisma.listingEndRequest.findFirst({
    where: { id: requestId, sellerId, status: "pending" },
  });
  if (!row) throw new Error("NOT_FOUND");

  const updated = await prisma.listingEndRequest.update({
    where: { id: requestId },
    data: { status: "canceled_by_seller", reviewedAt: new Date() },
  });

  await writeAudit({
    listingId: row.listingId,
    listingEndRequestId: row.id,
    actorUserId: sellerId,
    action: "end_request_canceled_by_seller",
  });

  return toDto(updated);
}

async function notifyAuctionBidders(listingId: string, title: string, message: string) {
  const bids = await prisma.bid.findMany({
    where: { listingId },
    select: { bidderId: true },
    distinct: ["bidderId"],
  });
  const href = `/marketplace/${encodeURIComponent(listingId)}`;
  for (const { bidderId } of bids) {
    await createNotification(prisma, {
      userId: bidderId,
      type: "auction_ended",
      title: `Auction ended · ${title.slice(0, 80)}`,
      body: message,
      href,
    });
  }
}

export async function applyEndedListingFromRequest(
  listingId: string,
  requestId: string,
  actorUserId: string,
): Promise<void> {
  await prisma.listing.update({
    where: { id: listingId },
    data: { status: "ended", auctionEndsAt: new Date() },
  });
  await writeAudit({
    listingId,
    listingEndRequestId: requestId,
    actorUserId,
    action: "listing_ended",
  });
}

export async function adminReviewListingEndRequest(input: {
  requestId: string;
  adminUserId: string;
  decision: "approve" | "deny";
  adminNote?: string;
}): Promise<ListingEndRequestDto> {
  const row = await prisma.listingEndRequest.findUnique({
    where: { id: input.requestId },
    include: { listing: { select: { id: true, title: true, sellerId: true, status: true } } },
  });
  if (!row || row.status !== "pending") throw new Error("NOT_FOUND");

  const note = input.adminNote?.trim() || null;

  if (input.decision === "approve") {
    const updated = await prisma.$transaction(async (tx) => {
      const req = await tx.listingEndRequest.update({
        where: { id: input.requestId },
        data: {
          status: "approved",
          reviewedAt: new Date(),
          reviewedById: input.adminUserId,
          adminNote: note,
        },
      });
      await tx.listing.update({
        where: { id: row.listingId },
        data: { status: "ended", auctionEndsAt: new Date() },
      });
      return req;
    });

    await writeAudit({
      listingId: row.listingId,
      listingEndRequestId: row.id,
      actorUserId: input.adminUserId,
      action: "end_request_approved",
      detail: note ?? "",
    });

    await notifyAuctionBidders(
      row.listingId,
      row.listing.title,
      "This auction was ended early after seller review. You will not be charged for this listing.",
    );

    await createNotification(prisma, {
      userId: row.sellerId,
      type: "listing_end_request",
      title: "End request approved",
      body: `Your request to end "${row.listing.title}" was approved. The listing is no longer active.`,
      href: `/account/listings`,
    });

    return toDto(updated);
  }

  const updated = await prisma.listingEndRequest.update({
    where: { id: input.requestId },
    data: {
      status: "denied",
      reviewedAt: new Date(),
      reviewedById: input.adminUserId,
      adminNote: note,
    },
  });

  await writeAudit({
    listingId: row.listingId,
    listingEndRequestId: row.id,
    actorUserId: input.adminUserId,
    action: "end_request_denied",
    detail: note ?? "",
  });

  await createNotification(prisma, {
    userId: row.sellerId,
    type: "listing_end_request",
    title: "End request denied",
    body: `Your request to end "${row.listing.title}" was denied. The auction remains active.`,
    href: `/account/listings`,
  });

  return toDto(updated);
}

export { parseReasonCategory };
