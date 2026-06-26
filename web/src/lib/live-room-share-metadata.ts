import type { Metadata } from "next";
import { iosAppStoreId } from "@/lib/app-store-links";

export const LIVE_SHARE_DESCRIPTION = "Join the live auction now";
export const UPCOMING_LIVE_SHARE_DESCRIPTION = "Join when we go live";

/** Branded fallback when a show has no uploaded thumbnail (absolute HTTPS). */
export const DEFAULT_LIVE_SHARE_OG_IMAGE =
  "https://images.unsplash.com/photo-1546519638-68e109498ffc?w=1200&h=630&q=80&auto=format&fit=crop";

export const CANONICAL_SHARE_SITE_FALLBACK = "https://shopgetvaulted.com";

const CATEGORY_LABEL_ALIASES: Record<string, string> = {
  cards: "Sports Cards",
  card: "Sports Cards",
  "sports cards": "Sports Cards",
  "trading cards": "Trading Cards",
  tcg: "Trading Cards",
  breaks: "Breaks",
  break: "Breaks",
  sealed: "Sealed",
  sneakers: "Sneakers",
  footwear: "Sneakers",
  watches: "Watches",
  watch: "Watches",
  memorabilia: "Memorabilia",
  memo: "Memorabilia",
  luxury: "Luxury",
  apparel: "Apparel",
  collectibles: "Other Collectibles",
  other: "Other",
};

function normalizeCategoryKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

function titleCaseWords(raw: string): string {
  return raw
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/** Human-readable category lane for share titles and OG metadata. */
export function formatLiveRoomCategoryDisplayName(category: string | null | undefined): string {
  const trimmed = (category ?? "").trim();
  if (!trimmed) return "Live";
  const key = normalizeCategoryKey(trimmed);
  if (CATEGORY_LABEL_ALIASES[key]) return CATEGORY_LABEL_ALIASES[key];
  if (trimmed.includes(" ") || /[A-Z]/.test(trimmed.slice(1))) return trimmed;
  return titleCaseWords(trimmed);
}

export function publicSiteBaseUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    process.env.URL?.trim() ||
    CANONICAL_SHARE_SITE_FALLBACK;
  const withProto = raw.includes("://") ? raw : `https://${raw}`;
  return withProto.replace(/\/$/, "");
}

/** Public share + og:url host (never beta in user-facing share links). */
export function canonicalShareSiteUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_CANONICAL_SHARE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SHARE_SITE_URL?.trim() ||
    CANONICAL_SHARE_SITE_FALLBACK;
  const withProto = raw.includes("://") ? raw : `https://${raw}`;
  return withProto.replace(/\/$/, "");
}

/** Host for dynamic OG images — same public domain as share links (apex proxies /api/og/live to the app). */
export function ogImageSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_OG_IMAGE_SITE_URL?.trim();
  if (explicit) {
    const withProto = explicit.includes("://") ? explicit : `https://${explicit}`;
    return withProto.replace(/\/$/, "");
  }
  return canonicalShareSiteUrl();
}

export function canonicalLiveRoomUrl(roomId: string, siteBase = canonicalShareSiteUrl()): string {
  const id = roomId.trim();
  return `${siteBase}/live/${encodeURIComponent(id)}`;
}

export function liveRoomOgImageUrl(roomId: string, siteBase = ogImageSiteUrl()): string {
  const id = roomId.trim();
  return `${siteBase}/api/og/live/${encodeURIComponent(id)}`;
}

export function resolveLiveRoomShareImageUrl(
  thumbnailUrl: string | null | undefined,
  siteBase = publicSiteBaseUrl(),
): string {
  const trimmed = thumbnailUrl?.trim() ?? "";
  if (!trimmed) return DEFAULT_LIVE_SHARE_OG_IMAGE;
  if (/^https:\/\//i.test(trimmed)) return trimmed;
  if (/^http:\/\//i.test(trimmed)) return trimmed.replace(/^http:/i, "https:");
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  if (trimmed.startsWith("/")) return `${siteBase}${trimmed}`;
  return `${siteBase}/${trimmed.replace(/^\/+/, "")}`;
}

function resolveShareMediaUrl(url: string | null | undefined, siteBase: string): string {
  const trimmed = url?.trim() ?? "";
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed.replace(/^http:\/\//i, "https://");
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  if (trimmed.startsWith("/")) return `${siteBase}${trimmed}`;
  return `${siteBase}/${trimmed.replace(/^\/+/, "")}`;
}

/** Background for OG card: thumbnail → host avatar → branded banner. */
export function resolveLiveRoomShareBackgroundUrl(
  thumbnailUrl: string | null | undefined,
  siteBase = publicSiteBaseUrl(),
  hostAvatarUrl?: string | null,
  brandedFallback = DEFAULT_LIVE_SHARE_OG_IMAGE,
): string | null {
  const thumb = resolveShareMediaUrl(thumbnailUrl, siteBase);
  if (thumb) return thumb;
  const avatar = resolveShareMediaUrl(hostAvatarUrl, siteBase);
  if (avatar) return avatar;
  return brandedFallback;
}

export type LiveRoomShareMetaInput = {
  id: string;
  title: string;
  category?: string | null;
  thumbnailUrl?: string | null;
  sellerUsername?: string | null;
  viewerCount?: number | null;
  /** When false, copy reflects an upcoming scheduled show. Defaults to live wording. */
  isLive?: boolean;
};

export function formatLiveRoomShareHostName(input: Pick<LiveRoomShareMetaInput, "sellerUsername">): string {
  const host = (input.sellerUsername ?? "host").trim().replace(/^@+/, "") || "host";
  return host;
}

/** og:title — live: "{hostName} is LIVE on Get Vaulted"; scheduled: "{hostName} on Get Vaulted" */
export function formatLiveRoomShareOgTitle(input: LiveRoomShareMetaInput): string {
  const host = formatLiveRoomShareHostName(input);
  if (input.isLive === false) {
    return `${host} on Get Vaulted`;
  }
  return `${host} is LIVE on Get Vaulted`;
}

/** og:description — "{showTitle} • …" */
export function formatLiveRoomShareDescription(input: Pick<LiveRoomShareMetaInput, "title" | "isLive">): string {
  const showTitle = input.title?.trim() || "Live show";
  const tagline = input.isLive === false ? UPCOMING_LIVE_SHARE_DESCRIPTION : LIVE_SHARE_DESCRIPTION;
  return `${showTitle} • ${tagline}`;
}

/** Native share / SMS copy — single line with URL. */
export function formatLiveRoomShareText(input: {
  hostUsername: string;
  showTitle: string;
  url: string;
  isLive?: boolean;
}): string {
  const host = formatLiveRoomShareHostName({ sellerUsername: input.hostUsername });
  const title = input.showTitle?.trim() || "Live show";
  const url = input.url.trim();
  if (input.isLive === false) {
    return `${host} on Get Vaulted — ${title}. Join when we go live: ${url}`;
  }
  return `${host} is LIVE on Get Vaulted — ${title}. Join now: ${url}`;
}

/** @deprecated Use formatLiveRoomShareOgTitle for new share surfaces. */
export function buildLiveRoomShareTitle(input: LiveRoomShareMetaInput): string {
  return formatLiveRoomShareOgTitle(input);
}

export function buildLiveRoomShareMetadata(input: LiveRoomShareMetaInput) {
  const title = formatLiveRoomShareOgTitle(input);
  const description = formatLiveRoomShareDescription(input);
  const url = canonicalLiveRoomUrl(input.id);
  const image = liveRoomOgImageUrl(input.id);
  return { title, description, url, image, siteBase: canonicalShareSiteUrl() };
}

export function liveRoomShareMetadataToNext(input: LiveRoomShareMetaInput): Metadata {
  const meta = buildLiveRoomShareMetadata(input);
  const appId = iosAppStoreId();
  return {
    title: meta.title,
    description: meta.description,
    itunes: {
      appId,
      appArgument: meta.url,
    },
    openGraph: {
      title: meta.title,
      description: meta.description,
      url: meta.url,
      type: "website",
      siteName: "Get Vaulted",
      images: [
        {
          url: meta.image,
          width: 1200,
          height: 630,
          alt: meta.title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: meta.title,
      description: meta.description,
      images: [meta.image],
    },
    alternates: {
      canonical: meta.url,
    },
  };
}
