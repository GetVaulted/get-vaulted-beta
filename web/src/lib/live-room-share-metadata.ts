import type { Metadata } from "next";

export const LIVE_SHARE_DESCRIPTION = "Watch live auctions, breaks, and drops on Get Vaulted.";

/** Default preview when a show has no uploaded thumbnail (absolute HTTPS). */
export const DEFAULT_LIVE_SHARE_OG_IMAGE =
  "https://images.unsplash.com/photo-1546519638-68e109498ffc?w=1200&h=630&q=80&auto=format&fit=crop";

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
    "https://beta.shopgetvaulted.com";
  const withProto = raw.includes("://") ? raw : `https://${raw}`;
  return withProto.replace(/\/$/, "");
}

export function canonicalLiveRoomUrl(roomId: string, siteBase = publicSiteBaseUrl()): string {
  const id = roomId.trim();
  return `${siteBase}/live/${encodeURIComponent(id)}`;
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

export type LiveRoomShareMetaInput = {
  id: string;
  title: string;
  category?: string | null;
  thumbnailUrl?: string | null;
  sellerUsername?: string | null;
};

export function buildLiveRoomShareTitle(input: LiveRoomShareMetaInput): string {
  const host = (input.sellerUsername ?? "host").trim().replace(/^@+/, "") || "host";
  const categoryName = formatLiveRoomCategoryDisplayName(input.category);
  const showTitle = input.title?.trim() || "Live show";
  return `${host} is live · ${categoryName} · ${showTitle}`;
}

export function buildLiveRoomShareMetadata(input: LiveRoomShareMetaInput) {
  const siteBase = publicSiteBaseUrl();
  const title = buildLiveRoomShareTitle(input);
  const description = LIVE_SHARE_DESCRIPTION;
  const url = canonicalLiveRoomUrl(input.id, siteBase);
  const image = resolveLiveRoomShareImageUrl(input.thumbnailUrl, siteBase);
  return { title, description, url, image, siteBase };
}

export function liveRoomShareMetadataToNext(input: LiveRoomShareMetaInput): Metadata {
  const meta = buildLiveRoomShareMetadata(input);
  return {
    title: meta.title,
    description: meta.description,
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
