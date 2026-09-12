import { fetchWebApiMobile } from '../lib/fetchWebApiMobile';
import { resolveSellerAccessToken } from '../lib/resolveSellerAccessToken';
import { readThroughPublishedListingsCache } from '../lib/publishedListingsCache';
import type { WebMarketplaceListing } from './webListingsTypes';

type ApiErrorBody = {
  error?: string;
  code?: string;
  issues?: string[];
  detail?: string;
  hint?: string;
};

function readApiErrorBody(body: unknown): ApiErrorBody {
  return body && typeof body === 'object' ? (body as ApiErrorBody) : {};
}

function formatApiErrorMessage(res: Response, body: unknown, context: string): string {
  // A 413 means the server/hosting platform rejected the request before it ever reached our own
  // route logic, so `body` is almost never our own JSON error shape (it's usually an empty or
  // platform-generated response). Special-case it so the user sees a plain "file too large"
  // message instead of a raw "Request failed (413)".
  if (res.status === 413) {
    return `${context}: That file is too large. Please choose a smaller file and try again.`;
  }
  const o = readApiErrorBody(body);
  const detail = typeof o.detail === 'string' ? o.detail.trim() : '';
  const hint = typeof o.hint === 'string' ? o.hint.trim() : '';
  const err = typeof o.error === 'string' ? o.error.trim() : '';
  const parts = [err, detail, hint].filter((s) => Boolean(s));
  if (parts.length) return `${context}: ${parts.join(' ')}`;
  return `${context}: Request failed (${res.status})`;
}

function publishApiErrorMessage(res: Response, body: unknown): string {
  const o = readApiErrorBody(body);
  if (o.code === 'PARCEL_REQUIRED') {
    return 'Publish failed: Add package weight and dimensions before publishing.';
  }
  if (o.code === 'P2022' || o.code === 'P2021') {
    return (
      o.error?.trim() ||
      'Publish failed: Server database is updating. Wait for deploy to finish, then try again.'
    );
  }
  if (o.code === 'SELLER_REQUIREMENTS_INCOMPLETE' || o.error === 'SELLER_REQUIREMENTS_INCOMPLETE') {
    const issues = o.issues?.length ? ` ${o.issues.join(' ')}` : '';
    return `Publish failed: Complete seller setup before publishing.${issues}`;
  }
  const msg = formatApiErrorMessage(res, body, 'Publish failed');
  return msg.startsWith('Publish failed:') ? msg : `Publish failed: ${msg}`;
}

function fetchApiErrorMessage(res: Response, body: unknown): string {
  return formatApiErrorMessage(res, body, 'fetch failed');
}

/** All mobile web API calls — includes beta Basic auth + X-GV-Supabase-Auth swap. */
export async function fetchWebApi(path: string, init: RequestInit = {}): Promise<Response> {
  return fetchWebApiMobile(path, init);
}

export async function getListingsAccessToken(): Promise<string> {
  try {
    return await resolveSellerAccessToken();
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    if (msg.includes('session expired') || msg.includes('Sign in')) throw e;
    throw new Error('Sign in to continue.');
  }
}

export async function fetchPublishedListingsFromWeb(opts?: { force?: boolean }): Promise<WebMarketplaceListing[]> {
  return readThroughPublishedListingsCache(async () => {
    let headers: HeadersInit | undefined;
    try {
      const token = await resolveSellerAccessToken();
      if (token) headers = { Authorization: `Bearer ${token}` };
    } catch {
      // Guest browse — no block filter.
    }
    const res = await fetchWebApi('/api/listings?scope=published', { headers });
    const body = (await res.json().catch(() => null)) as { listings?: WebMarketplaceListing[] } | null;
    if (!res.ok) {
      console.warn('[fetchPublishedListingsFromWeb]', fetchApiErrorMessage(res, body));
      return [];
    }
    return Array.isArray(body?.listings) ? body!.listings! : [];
  }, opts);
}

export type WebPublishedListingsPage = {
  listings: WebMarketplaceListing[];
  hasMore: boolean;
  page: number;
  pageSize: number;
  totalListingCount: number;
};

/**
 * Paginated variant of `fetchPublishedListingsFromWeb` — hits the same `scope=published` endpoint
 * the web marketplace's own "Load more" already uses, but actually sends `page`/`pageSize` so the
 * server's real pagination (it returns `hasMore`/`totalListingCount`) is used instead of silently
 * always getting page 1. Bypasses the single-snapshot cache above since that cache only ever holds
 * one page's worth of rows — each page here is fetched fresh.
 */
export async function fetchPublishedListingsPageFromWeb(opts: {
  page: number;
  pageSize: number;
  category?: string;
}): Promise<WebPublishedListingsPage> {
  let headers: HeadersInit | undefined;
  try {
    const token = await resolveSellerAccessToken();
    if (token) headers = { Authorization: `Bearer ${token}` };
  } catch {
    // Guest browse — no block filter.
  }
  const params = new URLSearchParams({
    scope: 'published',
    page: String(Math.max(1, Math.trunc(opts.page))),
    pageSize: String(Math.min(Math.max(1, Math.trunc(opts.pageSize)), 120)),
  });
  if (opts.category) params.set('category', opts.category);
  const res = await fetchWebApi(`/api/listings?${params.toString()}`, { headers });
  const body = (await res.json().catch(() => null)) as {
    listings?: WebMarketplaceListing[];
    hasMore?: boolean;
    page?: number;
    pageSize?: number;
    totalListingCount?: number;
  } | null;
  if (!res.ok) {
    console.warn('[fetchPublishedListingsPageFromWeb]', fetchApiErrorMessage(res, body));
    return { listings: [], hasMore: false, page: opts.page, pageSize: opts.pageSize, totalListingCount: 0 };
  }
  return {
    listings: Array.isArray(body?.listings) ? body!.listings! : [],
    hasMore: Boolean(body?.hasMore),
    page: body?.page ?? opts.page,
    pageSize: body?.pageSize ?? opts.pageSize,
    totalListingCount: body?.totalListingCount ?? 0,
  };
}

export async function fetchListingsByIdsFromWeb(ids: string[]): Promise<WebMarketplaceListing[]> {
  const uniq = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  if (!uniq.length) return [];
  const res = await fetchWebApi(`/api/listings?scope=ids&ids=${encodeURIComponent(uniq.join(','))}`);
  const body = (await res.json().catch(() => null)) as { listings?: WebMarketplaceListing[] } | null;
  if (!res.ok) {
    console.warn('[fetchListingsByIdsFromWeb]', fetchApiErrorMessage(res, body));
    return [];
  }
  return Array.isArray(body?.listings) ? body!.listings! : [];
}

export async function fetchMarketplaceListingFromWeb(listingId: string): Promise<WebMarketplaceListing | null> {
  const detail = await fetchListingDetailFromWeb(listingId);
  return detail?.marketplace ?? null;
}

export type WebListingDetailResponse = {
  marketplace: WebMarketplaceListing | null;
  stored: WebStoredListing | null;
  endRequest: import('./listingEndRepository').WebListingEndRequest | null;
  bidCount?: number;
};

export async function fetchListingDetailFromWeb(
  listingId: string,
  accessToken?: string,
): Promise<WebListingDetailResponse | null> {
  const headers: Record<string, string> = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const res = await fetchWebApi(`/api/listings/${encodeURIComponent(listingId)}`, { headers });
  const body = (await res.json().catch(() => null)) as WebListingDetailResponse & { error?: string };
  if (!res.ok) {
    if (res.status !== 404) {
      console.warn('[fetchListingDetailFromWeb]', fetchApiErrorMessage(res, body));
    }
    return null;
  }
  return {
    marketplace: body.marketplace ?? null,
    stored: body.stored ?? null,
    endRequest: body.endRequest ?? null,
    bidCount: body.bidCount,
  };
}

function mimeFromUri(uri: string): string {
  const lower = uri.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

/** Upload a listing image. Refreshes the seller JWT before POST (and once on 401). */
export async function uploadListingImageViaWeb(accessToken: string, localUri: string): Promise<string> {
  const mime = mimeFromUri(localUri);
  const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
  const form = new FormData();
  form.append('file', {
    uri: localUri,
    name: `listing-${Date.now()}.${ext}`,
    type: mime,
  } as unknown as Blob);

  const post = async (bearer: string) =>
    fetchWebApi('/api/uploads/listing-image', {
      method: 'POST',
      headers: { Authorization: `Bearer ${bearer}` },
      body: form,
    });

  let token = await resolveSellerAccessToken(accessToken);
  let res = await post(token);
  if (res.status === 401) {
    token = await resolveSellerAccessToken(accessToken);
    res = await post(token);
  }
  const body = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
  if (!res.ok) throw new Error(publishApiErrorMessage(res, body));
  const url = body?.url?.trim();
  if (!url) throw new Error('Image upload did not return a URL.');
  return url;
}

function teaserMimeFromUri(uri: string): string {
  const lower = uri.toLowerCase();
  if (lower.endsWith('.mov')) return 'video/quicktime';
  return 'video/mp4';
}

/** Upload a short scheduled-room teaser (MP4/MOV ≤15s). `durationMs` required for server validation. */
export async function uploadLiveTeaserViaWeb(
  accessToken: string,
  localUri: string,
  durationMs: number,
): Promise<{ url: string; durationMs: number }> {
  const mime = teaserMimeFromUri(localUri);
  const ext = mime.includes('quicktime') ? 'mov' : 'mp4';
  const form = new FormData();
  form.append('file', {
    uri: localUri,
    name: `live-teaser-${Date.now()}.${ext}`,
    type: mime,
  } as unknown as Blob);
  form.append('durationMs', String(Math.round(durationMs)));

  const post = async (bearer: string) =>
    fetchWebApi('/api/uploads/live-teaser', {
      method: 'POST',
      headers: { Authorization: `Bearer ${bearer}` },
      body: form,
    });

  let token = await resolveSellerAccessToken(accessToken);
  let res = await post(token);
  if (res.status === 401) {
    token = await resolveSellerAccessToken(accessToken);
    res = await post(token);
  }
  const body = (await res.json().catch(() => null)) as {
    url?: string;
    durationMs?: number;
    error?: string;
  } | null;
  if (!res.ok) throw new Error(publishApiErrorMessage(res, body));
  const url = body?.url?.trim();
  if (!url) throw new Error('Teaser upload did not return a URL.');
  return {
    url,
    durationMs: typeof body?.durationMs === 'number' ? body.durationMs : Math.round(durationMs),
  };
}

export type CreateListingViaWebBody = Record<string, unknown>;

export type WebStoredListing = {
  id: string;
  sellerId: string;
  title: string;
  status?: string;
  buyingFormat?: 'buy_now' | 'auction';
  allowOffers?: boolean;
  allowLayaway?: boolean;
  acceptTradeOffers?: boolean;
  /** Set on create when seller picks marketplace vs live show wizard. */
  inventoryChannel?: 'marketplace' | 'live_show';
  imageDataUrls?: string[];
  description?: string;
  price?: number;
  startingBid?: number;
  displayBid?: number;
  shippingPriceUsd?: number;
  handlingTime?: string;
  condition?: string;
  category?: string;
  watchers?: number;
};

export async function fetchMyListingsFromWeb(accessToken: string): Promise<WebStoredListing[]> {
  const res = await fetchWebApi('/api/listings?scope=mine', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = (await res.json().catch(() => null)) as { listings?: WebStoredListing[] } | null;
  if (!res.ok) {
    console.warn('[fetchMyListingsFromWeb]', fetchApiErrorMessage(res, body));
    return [];
  }
  return Array.isArray(body?.listings) ? body!.listings! : [];
}

export async function fetchListingWorkspaceFromWeb(accessToken: string): Promise<WebStoredListing | null> {
  const res = await fetchWebApi('/api/listings?scope=workspace', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = (await res.json().catch(() => null)) as { listing?: WebStoredListing | null } | null;
  if (!res.ok) {
    console.warn('[fetchListingWorkspaceFromWeb]', fetchApiErrorMessage(res, body));
    return null;
  }
  return body?.listing ?? null;
}

export async function fetchListingSellerId(
  listingId: string,
  accessToken?: string,
): Promise<string | null> {
  const headers: Record<string, string> = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const res = await fetchWebApi(`/api/listings/${encodeURIComponent(listingId)}`, { headers });
  const body = (await res.json().catch(() => null)) as {
    marketplace?: { sellerId?: string };
    stored?: { sellerId?: string };
  } | null;
  if (!res.ok) return null;
  return body?.marketplace?.sellerId ?? body?.stored?.sellerId ?? null;
}

export async function createListingViaWeb(
  accessToken: string,
  body: CreateListingViaWebBody,
): Promise<{ listingId: string }> {
  const res = await fetchWebApi('/api/listings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) as { listing?: { id?: string }; error?: string } | null;
  if (!res.ok) throw new Error(publishApiErrorMessage(res, json));
  const id = json?.listing?.id;
  if (!id) throw new Error('Listing was created but no id was returned.');
  return { listingId: id };
}
