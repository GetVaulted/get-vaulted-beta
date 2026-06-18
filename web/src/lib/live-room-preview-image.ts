import { publicSiteBaseUrl } from "@/lib/live-room-share-metadata";

/** Branded fallback when no thumbnail, listing, or category art exists. */
export const DEFAULT_LIVE_ROOM_PREVIEW_IMAGE =
  "https://images.unsplash.com/photo-1546519638-68e109498ffc?w=1200&h=1500&q=80&auto=format&fit=crop";

const CATEGORY_PREVIEW: Record<string, string> = {
  breaks: "https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=900&h=1125&q=80&auto=format&fit=crop",
  break: "https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=900&h=1125&q=80&auto=format&fit=crop",
  "sports cards": "https://images.unsplash.com/photo-1606107557195-0f29cb4f3ccb?w=900&h=1125&q=80&auto=format&fit=crop",
  cards: "https://images.unsplash.com/photo-1606107557195-0f29cb4f3ccb?w=900&h=1125&q=80&auto=format&fit=crop",
  "trading cards": "https://images.unsplash.com/photo-1606107557195-0f29cb4f3ccb?w=900&h=1125&q=80&auto=format&fit=crop",
  memorabilia: "https://images.unsplash.com/photo-1566577730330-574a2072e3a7?w=900&h=1125&q=80&auto=format&fit=crop",
  sneakers: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=900&h=1125&q=80&auto=format&fit=crop",
  watches: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=900&h=1125&q=80&auto=format&fit=crop",
  sealed: "https://images.unsplash.com/photo-1618351131374-a792ca659e41?w=900&h=1125&q=80&auto=format&fit=crop",
};

export function resolveLiveRoomMediaUrl(
  url: string | null | undefined,
  siteBase = publicSiteBaseUrl(),
): string {
  const trimmed = url?.trim() ?? "";
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed.replace(/^http:\/\//i, "https://");
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  if (trimmed.startsWith("/")) return `${siteBase}${trimmed}`;
  return `${siteBase}/${trimmed.replace(/^\/+/, "")}`;
}

function categoryPreviewImage(category: string | null | undefined): string {
  const key = (category ?? "").trim().toLowerCase().replace(/[_-]+/g, " ");
  return CATEGORY_PREVIEW[key] ?? DEFAULT_LIVE_ROOM_PREVIEW_IMAGE;
}

export type LiveRoomPreviewImageInput = {
  thumbnailUrl?: string | null;
  firstItemImageUrl?: string | null;
  category?: string | null;
};

/** uploaded thumbnail → first listing/queue image → category art → branded placeholder */
export function resolveLiveRoomPreviewImage(
  input: LiveRoomPreviewImageInput,
  siteBase = publicSiteBaseUrl(),
): string {
  const thumb = resolveLiveRoomMediaUrl(input.thumbnailUrl, siteBase);
  if (thumb) return thumb;
  const item = resolveLiveRoomMediaUrl(input.firstItemImageUrl, siteBase);
  if (item) return item;
  return categoryPreviewImage(input.category);
}
