import type { Metadata } from "next";
import {
  canonicalShareSiteUrl,
  DEFAULT_LIVE_SHARE_OG_IMAGE,
  resolveLiveRoomShareImageUrl,
  SITE_OG_IMAGE_PATH,
} from "@/lib/live-room-share-metadata";
import { publicListingHref } from "@/lib/listing-routes";
import { sellerProfilePath } from "@/lib/seller-profile-url";

export const SITE_NAME = "Get Vaulted";

export const DEFAULT_SITE_DESCRIPTION =
  "Premium collectibles marketplace for graded cards, live breaks, auctions, and trusted seller shops.";

/**
 * Branded fallback OG image.
 * Relative path resolves via `metadataBase` in the root layout (works on beta + prod).
 */
export const DEFAULT_SITE_OG_IMAGE = SITE_OG_IMAGE_PATH;

/** Absolute branded OG image for non-Next consumers. */
export const DEFAULT_SITE_OG_IMAGE_ABSOLUTE = DEFAULT_LIVE_SHARE_OG_IMAGE;

export function absoluteCanonicalUrl(path: string): string {
  const base = canonicalShareSiteUrl();
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalized}`;
}

export function resolveAbsoluteMediaUrl(url: string | null | undefined): string | undefined {
  const resolved = resolveLiveRoomShareImageUrl(url, canonicalShareSiteUrl());
  return resolved || undefined;
}

export function buildIndexablePageMetadata(args: {
  title: string;
  description: string;
  path: string;
  imageUrl?: string | null;
  type?: "website" | "article";
}): Metadata {
  const canonical = absoluteCanonicalUrl(args.path);
  const image = resolveAbsoluteMediaUrl(args.imageUrl) ?? DEFAULT_SITE_OG_IMAGE;
  return {
    title: args.title,
    description: args.description,
    alternates: { canonical },
    openGraph: {
      title: args.title,
      description: args.description,
      url: canonical,
      type: args.type ?? "website",
      siteName: SITE_NAME,
      images: [{ url: image, width: 1200, height: 630, alt: args.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: args.title,
      description: args.description,
      images: [image],
    },
    robots: { index: true, follow: true },
  };
}

export const NOINDEX_METADATA: Metadata = {
  robots: { index: false, follow: false },
};

export function buildListingPageMetadata(args: {
  listingId: string;
  title: string;
  description: string;
  condition: string;
  buyingFormat: string;
  imageUrl?: string | null;
}): Metadata {
  const formatLabel = args.buyingFormat === "buy_now" ? "Buy now" : "Auction";
  const pageDescription =
    args.description.trim() ||
    `${args.condition} · ${formatLabel} on Get Vaulted marketplace.`;
  return buildIndexablePageMetadata({
    title: `${args.title} | Get Vaulted`,
    description: pageDescription,
    path: publicListingHref(args.listingId),
    imageUrl: args.imageUrl,
  });
}

export function buildSellerPageMetadata(args: {
  username: string;
  displayName?: string | null;
  imageUrl?: string | null;
}): Metadata {
  const handle = args.username.trim();
  const title = `@${handle} · Seller shop | Get Vaulted`;
  const description = args.displayName?.trim()
    ? `${args.displayName.trim()} (@${handle}) — listings and storefront on Get Vaulted.`
    : `Listings and storefront for @${handle} on Get Vaulted.`;
  return buildIndexablePageMetadata({
    title,
    description,
    path: sellerProfilePath(handle),
    imageUrl: args.imageUrl,
  });
}

export type ListingProductJsonLdInput = {
  listingId: string;
  title: string;
  description?: string;
  imageUrl?: string | null;
  condition: string;
  buyingFormat: string;
  priceUsd: number;
  currentBidUsd?: number | null;
  startingBidUsd?: number | null;
  sellerUsername: string;
  status: string;
};

export function buildListingProductJsonLd(input: ListingProductJsonLdInput): Record<string, unknown> {
  const url = absoluteCanonicalUrl(publicListingHref(input.listingId));
  const image = resolveAbsoluteMediaUrl(input.imageUrl);
  const isAuction = input.buyingFormat === "auction";
  const price = isAuction
    ? (input.currentBidUsd ?? input.startingBidUsd ?? input.priceUsd)
    : input.priceUsd;
  const inStock = input.status === "active" || input.status === "auction_live";

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: input.title,
    description: input.description?.trim() || `${input.condition} collectibles listing on Get Vaulted.`,
    ...(image ? { image: [image] } : {}),
    brand: { "@type": "Brand", name: SITE_NAME },
    offers: {
      "@type": "Offer",
      url,
      priceCurrency: "USD",
      price: price.toFixed(2),
      availability: inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      seller: {
        "@type": "Organization",
        name: input.sellerUsername,
        url: absoluteCanonicalUrl(sellerProfilePath(input.sellerUsername)),
      },
    },
  };
}

export function buildSellerProfileJsonLd(args: {
  username: string;
  displayName?: string | null;
  imageUrl?: string | null;
}): Record<string, unknown> {
  const url = absoluteCanonicalUrl(sellerProfilePath(args.username));
  const image = resolveAbsoluteMediaUrl(args.imageUrl);
  return {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    mainEntity: {
      "@type": "Organization",
      name: args.displayName?.trim() || args.username,
      alternateName: `@${args.username}`,
      url,
      ...(image ? { image } : {}),
    },
  };
}

export function buildWebSiteJsonLd(): Record<string, unknown> {
  const url = canonicalShareSiteUrl();
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url,
    description: DEFAULT_SITE_DESCRIPTION,
    potentialAction: {
      "@type": "SearchAction",
      target: `${url}/marketplace?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}
