/**
 * Pure helpers for the public seller profile: links, live-show card copy and the trust rows.
 * Mirrors what the web profile shows (`/seller/[username]`), fed by `/api/sellers/shop`.
 */

export const PROFILE_BIO_MAX = 280;

export type ProfileLinkKey = 'instagram' | 'tiktok' | 'youtube' | 'x' | 'website';

export const PROFILE_LINK_KEYS: ProfileLinkKey[] = ['instagram', 'tiktok', 'youtube', 'x', 'website'];

export const PROFILE_LINK_LABELS: Record<ProfileLinkKey, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  x: 'X',
  website: 'Website',
};

export const PROFILE_LINK_PLACEHOLDERS: Record<ProfileLinkKey, string> = {
  instagram: '@yourhandle',
  tiktok: '@yourhandle',
  youtube: '@yourchannel',
  x: '@yourhandle',
  website: 'yoursite.com',
};

export type ProfileLink = { key: ProfileLinkKey; label: string; url: string };

export type ProfileShow = {
  id: string;
  title: string;
  category: string;
  status: 'live' | 'scheduled' | 'ended';
  thumbnailUrl: string | null;
  scheduledStartAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
};

export type ProfileShows = {
  liveNow: ProfileShow | null;
  nextShow: ProfileShow | null;
  lastLive: ProfileShow | null;
  recent: ProfileShow[];
  totalShows: number;
};

export type ProfileTrust = {
  sellerLevel: string;
  sellerLevelLabel: string;
  sellerLevelDescription: string;
  ordersCompleted: number;
  memberSince: string;
  emailVerified: boolean;
};

/** Only open web links from our own validated store: https (or http) with a host, nothing else. */
export function safeProfileLinkUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = /^(https?):\/\/([^\s/?#]+)/i.exec(url.trim());
  if (!m || !m[2].includes('.')) return null;
  return url.trim();
}

/** Chip text: `@handle` for networks, bare host for a website. */
export function profileLinkDisplay(link: Pick<ProfileLink, 'key' | 'url'>): string {
  const m = /^https?:\/\/(?:www\.)?([^/?#]+)([^?#]*)/i.exec(link.url.trim());
  if (!m) return link.url;
  const host = m[1];
  const seg = m[2].split('/').filter(Boolean)[0] ?? '';
  if (link.key === 'website') return host;
  if (link.key === 'youtube') {
    if (host === 'youtu.be') return 'YouTube video';
    return seg.startsWith('@') ? seg : 'YouTube';
  }
  return seg ? `@${seg.replace(/^@/, '')}` : link.url;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatShowDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

export function formatShowDateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const h = d.getHours();
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${h12}:${mm} ${h >= 12 ? 'PM' : 'AM'}`;
}

export function formatMemberSince(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export type ProfileShowCardModel = {
  show: ProfileShow;
  kicker: string;
  isLive: boolean;
};

/** Live now beats the next scheduled show, which beats the last finished one. */
export function profileShowCard(shows: ProfileShows | null | undefined): ProfileShowCardModel | null {
  if (!shows) return null;
  if (shows.liveNow) return { show: shows.liveNow, kicker: 'Live now', isLive: true };
  if (shows.nextShow) {
    const when = formatShowDateTime(shows.nextShow.scheduledStartAt);
    return { show: shows.nextShow, kicker: when ? `Next show · ${when}` : 'Next show', isLive: false };
  }
  if (shows.lastLive) {
    const when = formatShowDate(shows.lastLive.endedAt ?? shows.lastLive.startedAt);
    return { show: shows.lastLive, kicker: when ? `Last live · ${when}` : 'Last live', isLive: false };
  }
  return null;
}

/** `4.8 ★ (12)` or `None yet`. */
export function reviewSummaryLabel(summary: { count: number; average: number | null } | null | undefined): string {
  if (!summary || summary.count <= 0 || summary.average == null) return 'None yet';
  return `${summary.average.toFixed(1)} ★ (${summary.count.toLocaleString('en-US')})`;
}

export function buildTrustRows(
  trust: ProfileTrust,
  reviews?: { count: number; average: number | null } | null,
): { label: string; value: string }[] {
  return [
    { label: 'Seller level', value: trust.sellerLevelLabel },
    { label: 'Items sold', value: trust.ordersCompleted.toLocaleString('en-US') },
    { label: 'Member since', value: formatMemberSince(trust.memberSince) },
    { label: 'Email', value: trust.emailVerified ? 'Verified' : 'Not verified' },
    ...(reviews !== undefined ? [{ label: 'Buyer reviews', value: reviewSummaryLabel(reviews) }] : []),
  ];
}

/**
 * A basic profile card built from the seller shop payload.
 *
 * The profile screen normally reads the Supabase `profiles` row by id, but a few accounts have two different ids
 * (the store's `User.id` that listings and shows use, and the Supabase sign-in id that `profiles` uses), so that
 * lookup finds nothing and the screen said "This profile is no longer available" for a live seller. The shop
 * response always carries the seller's name and photo, so use it when the `profiles` row cannot be found by this id.
 */
export function profileLiteFromShopSeller(
  userId: string,
  seller: { username?: string | null; name?: string | null; image?: string | null } | null | undefined,
): { id: string; username: string | null; display_name: string | null; avatar_url: string | null } | null {
  const username = seller?.username?.trim() || null;
  if (!seller || !username) return null;
  return {
    id: userId,
    username,
    display_name: seller.name?.trim() || username,
    avatar_url: seller.image?.trim() || null,
  };
}
