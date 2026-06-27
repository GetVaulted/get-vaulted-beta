import { fetchWebApiAuthed } from '../lib/fetchWebApiAuthed';

export type WatchlistItem = {
  watchlistItemId: string;
  listingId: string;
  title: string;
  thumbUrl: string | null;
  priceUsd: number;
  buyingFormat: string;
  sellerUsername: string;
  status: string;
  savedAt: string;
};

export async function fetchAccountWatchlist(accessToken: string): Promise<WatchlistItem[]> {
  const res = await fetchWebApiAuthed('/api/account/watchlist', accessToken);
  if (!res.ok) {
    console.warn('fetchAccountWatchlist', res.status);
    return [];
  }
  const data = (await res.json()) as { items?: WatchlistItem[] };
  return Array.isArray(data.items) ? data.items : [];
}

export async function removeFromWatchlist(accessToken: string, listingId: string): Promise<boolean> {
  const res = await fetchWebApiAuthed(`/api/watchlist/${encodeURIComponent(listingId)}`, accessToken, {
    method: 'DELETE',
  });
  return res.ok;
}
