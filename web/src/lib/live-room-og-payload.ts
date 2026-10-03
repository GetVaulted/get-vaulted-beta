import { safeDecodeRouteSegment } from "@/lib/live-loader-debug";
import { resolveLiveRoomPreviewImage } from "@/lib/live-room-preview-image";
import {
  canonicalShareSiteUrl,
  formatLiveRoomShareDescription,
  formatLiveRoomShareOgTitle,
  ogImageSiteUrl,
  publicSiteBaseUrl,
  resolveLiveRoomShareBackgroundUrl,
  resolveLiveRoomShareMediaUrl,
} from "@/lib/live-room-share-metadata";
import { prisma } from "@/lib/prisma";

export type LiveRoomOgPayload = {
  id: string;
  showTitle: string;
  hostUsername: string;
  hostDisplayName: string;
  hostAvatarUrl: string | null;
  backgroundImageUrl: string | null;
  viewerCount: number;
  isLive: boolean;
  ogTitle: string;
  ogDescription: string;
  canonicalUrl: string;
  ogImageUrl: string;
};

function formatHostDisplayName(username: string | null | undefined): string {
  const clean = (username ?? "").trim().replace(/^@+/, "");
  return clean ? `@${clean}` : "@host";
}

export async function fetchLiveRoomOgPayload(rawShowId: string): Promise<LiveRoomOgPayload | null> {
  const showId = safeDecodeRouteSegment(rawShowId ?? "");
  if (!showId) return null;

  const assetBase = publicSiteBaseUrl();
  const row = await prisma.liveRoom.findUnique({
    where: { id: showId },
    select: {
      id: true,
      title: true,
      category: true,
      thumbnailUrl: true,
      viewerCount: true,
      status: true,
      seller: { select: { username: true, image: true, name: true } },
      items: {
        select: { imageUrl: true },
        orderBy: { sortOrder: "asc" },
        take: 1,
      },
    },
  });

  if (!row) return null;

  const hostUsername = row.seller.username?.trim().replace(/^@+/, "") || "host";
  const hostAvatarUrl = resolveLiveRoomShareMediaUrl(row.seller.image, assetBase) || null;
  const firstItemImage = row.items[0]?.imageUrl ?? null;
  const previewFallback = resolveLiveRoomPreviewImage(
    {
      thumbnailUrl: null,
      firstItemImageUrl: firstItemImage,
      category: row.category,
    },
    assetBase,
  );

  // Background is the show's own art (uploaded tile → first lot photo → category banner).
  // The host's round avatar is rendered separately as a badge — never stretch it as the full-bleed background.
  const backgroundImageUrl = resolveLiveRoomShareBackgroundUrl(row.thumbnailUrl, assetBase, null, previewFallback);

  const metaInput = {
    id: row.id,
    title: row.title,
    sellerUsername: hostUsername,
    isLive: row.status === "live",
  };

  return {
    id: row.id,
    showTitle: row.title?.trim() || "Live show",
    hostUsername,
    hostDisplayName: formatHostDisplayName(hostUsername),
    hostAvatarUrl,
    backgroundImageUrl,
    viewerCount: row.viewerCount ?? 0,
    isLive: row.status === "live",
    ogTitle: formatLiveRoomShareOgTitle(metaInput),
    ogDescription: formatLiveRoomShareDescription(metaInput),
    canonicalUrl: `${canonicalShareSiteUrl()}/live/${encodeURIComponent(row.id)}`,
    ogImageUrl: `${ogImageSiteUrl()}/api/og/live/${encodeURIComponent(row.id)}`,
  };
}

export function formatOgViewerLabel(viewerCount: number): string | null {
  if (!Number.isFinite(viewerCount) || viewerCount < 1) return null;
  if (viewerCount >= 1_000_000) {
    return `${(viewerCount / 1_000_000).toFixed(1).replace(/\.0$/, "")}M watching`;
  }
  if (viewerCount >= 1_000) {
    return `${(viewerCount / 1_000).toFixed(1).replace(/\.0$/, "")}k watching`;
  }
  return `${Math.floor(viewerCount)} watching`;
}
