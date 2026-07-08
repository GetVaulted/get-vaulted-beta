import type { Prisma } from "@/generated/prisma/client";

export type SellerShopTab = "all" | "buy_now" | "auctions" | "sold";

export const SELLER_SHOP_TABS: { key: SellerShopTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "buy_now", label: "Buy now" },
  { key: "auctions", label: "Auctions" },
  { key: "sold", label: "Sold" },
];

export const SELLER_SHOP_DEFAULT_PAGE_SIZE = 60;
export const SELLER_SHOP_MAX_PAGE_SIZE = 60;

export function parseSellerShopTab(v: string | null | undefined): SellerShopTab {
  if (v === "buy_now" || v === "auctions" || v === "sold") return v;
  return "all";
}

export function sellerShopListingWhere(sellerId: string, tab: SellerShopTab): Prisma.ListingWhereInput {
  if (tab === "sold") {
    return { sellerId, status: "sold" };
  }
  const visible = { moderationRemovedAt: null };
  if (tab === "buy_now") {
    return { sellerId, status: "active", buyingFormat: "buy_now", ...visible };
  }
  if (tab === "auctions") {
    return {
      sellerId,
      ...visible,
      OR: [{ status: "auction_live" }, { status: "active", buyingFormat: "auction" }],
    };
  }
  return { sellerId, status: { in: ["active", "auction_live"] }, ...visible };
}

export function sellerShopEmptyCopy(tab: SellerShopTab): string {
  return tab === "sold" ? "No sold listings to show yet." : "This seller has no active listings.";
}
