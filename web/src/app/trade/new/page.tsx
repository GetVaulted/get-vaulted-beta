import { redirect } from "next/navigation";
import { TradeBuilderPage, type TradePickerListing } from "@/components/trade/TradeBuilderPage";
import { authOptions, getServerSessionSafe } from "@/lib/auth";
import { isHiddenFixtureSellerEmail, prismaSellerVisibleOnPublicMarketplace } from "@/lib/demo-seed-sellers";
import { prisma } from "@/lib/prisma";

type TradeNewPageProps = {
  searchParams: Promise<{ listingId?: string }>;
};

type PrefillError = { message: string; listingHref: string } | null;

function toPickerListing(row: {
  id: string;
  title: string;
  category: string;
  condition: string;
  priceUsd: number;
  status: "active" | "auction_live" | "sold" | "draft" | "awaiting_auction_payment" | "auction_ended_unpaid";
  sellerId: string;
  acceptTradeOffers: boolean;
  images: Array<{ url: string; sortOrder: number }>;
  seller: { username: string };
}): TradePickerListing {
  const cover = [...row.images].sort((a, b) => a.sortOrder - b.sortOrder)[0]?.url ?? null;
  return {
    id: row.id,
    title: row.title,
    imageUrl: cover,
    priceUsd: row.priceUsd,
    category: row.category,
    condition: row.condition,
    status: row.status,
    sellerId: row.sellerId,
    sellerUsername: row.seller.username,
    acceptTradeOffers: row.acceptTradeOffers,
  };
}

function isRequestedTradeEligible(listing: { status: string; acceptTradeOffers: boolean }): boolean {
  return (listing.status === "active" || listing.status === "auction_live") && listing.acceptTradeOffers;
}

export default async function TradeNewPage({ searchParams }: TradeNewPageProps) {
  const session = await getServerSessionSafe();
  const sp = await searchParams;
  const listingId = typeof sp.listingId === "string" ? sp.listingId.trim() : "";

  if (!session?.user?.id) {
    const ret = listingId ? `/trade/new?listingId=${encodeURIComponent(listingId)}` : "/trade/new";
    redirect(`/signin?returnTo=${encodeURIComponent(ret)}`);
  }

  const viewerId = session.user.id;

  const [offeredRows, requestedRows, prefillRow] = await Promise.all([
    prisma.listing.findMany({
      where: { sellerId: viewerId, status: { in: ["active", "auction_live"] } },
      orderBy: { updatedAt: "desc" },
      include: { images: true, seller: { select: { username: true } } },
      take: 80,
    }),
    prisma.listing.findMany({
      where: {
        sellerId: { not: viewerId },
        status: { in: ["active", "auction_live"] },
        acceptTradeOffers: true,
        moderationRemovedAt: null,
        seller: prismaSellerVisibleOnPublicMarketplace(),
      },
      orderBy: { updatedAt: "desc" },
      include: { images: true, seller: { select: { username: true } } },
      take: 160,
    }),
    listingId
      ? prisma.listing.findUnique({
          where: { id: listingId },
          include: { seller: { select: { username: true, email: true } } },
        })
      : Promise.resolve(null),
  ]);

  let prefillListingId: string | null = null;
  let prefillError: PrefillError = null;
  if (listingId) {
    if (!prefillRow) {
      prefillError = { message: "That listing could not be found.", listingHref: "/marketplace" };
    } else if (prefillRow.sellerId === viewerId) {
      prefillError = {
        message: "You can’t start a trade by requesting your own listing.",
        listingHref: `/marketplace/${encodeURIComponent(prefillRow.id)}`,
      };
    } else if (isHiddenFixtureSellerEmail(prefillRow.seller.email)) {
      prefillError = { message: "That listing could not be found.", listingHref: "/marketplace" };
    } else if (!isRequestedTradeEligible(prefillRow)) {
      prefillError = {
        message: "This listing is not available for trade offers right now.",
        listingHref: `/marketplace/${encodeURIComponent(prefillRow.id)}`,
      };
    } else {
      prefillListingId = prefillRow.id;
    }
  }

  const offeredOptions = offeredRows.map((row) => toPickerListing(row));
  const requestedOptions = requestedRows.map((row) => toPickerListing(row));

  return (
    <TradeBuilderPage
      viewerId={viewerId}
      prefillListingId={prefillListingId}
      prefillError={prefillError}
      offeredOptions={offeredOptions}
      requestedOptions={requestedOptions}
    />
  );
}
