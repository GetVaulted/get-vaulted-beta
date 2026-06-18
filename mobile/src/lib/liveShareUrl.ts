/** Production share links for live shows — never beta in user-facing shares. */
export const CANONICAL_LIVE_SHARE_SITE = 'https://shopgetvaulted.com';

export function canonicalLiveShareSiteUrl(): string {
  const raw = process.env.EXPO_PUBLIC_SHARE_SITE_URL?.trim() || CANONICAL_LIVE_SHARE_SITE;
  const withProto = raw.includes('://') ? raw : `https://${raw}`;
  return withProto.replace(/\/+$/, '');
}

/** Public share URL: https://shopgetvaulted.com/live/[showId] */
export function canonicalLiveShareUrl(roomId: string): string | null {
  if (!roomId.trim()) return null;
  return `${canonicalLiveShareSiteUrl()}/live/${encodeURIComponent(roomId.trim())}`;
}
