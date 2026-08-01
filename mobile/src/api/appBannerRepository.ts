import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchWebApi } from './webListingsRepository';

export type PublicAppBanner = {
  title: string;
  body: string;
  ctaLabel: string;
  href: string;
  dismissKey: string;
};

const CACHE_KEY = 'gv:platform-app-banner:v1';
const DISMISS_PREFIX = 'gv:app-banner-dismissed:';
const CACHE_TTL_MS = 60_000;

type CachedBanner = {
  fetchedAt: number;
  banner: PublicAppBanner | null;
};

function normalizeBanner(raw: unknown): PublicAppBanner | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const title = typeof o.title === 'string' ? o.title.trim() : '';
  const body = typeof o.body === 'string' ? o.body.trim() : '';
  if (!title && !body) return null;
  const dismissKey =
    typeof o.dismissKey === 'string' && o.dismissKey.trim() ? o.dismissKey.trim() : 'default';
  return {
    title,
    body,
    ctaLabel: typeof o.ctaLabel === 'string' ? o.ctaLabel.trim() : '',
    href: typeof o.href === 'string' ? o.href.trim() : '',
    dismissKey,
  };
}

async function readCache(): Promise<CachedBanner | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedBanner;
    if (!parsed || typeof parsed.fetchedAt !== 'number') return null;
    if (Date.now() - parsed.fetchedAt > CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeCache(banner: PublicAppBanner | null): Promise<void> {
  try {
    const payload: CachedBanner = { fetchedAt: Date.now(), banner };
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export async function isAppBannerDismissed(dismissKey: string): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(`${DISMISS_PREFIX}${dismissKey}`);
    return v === '1';
  } catch {
    return false;
  }
}

export async function dismissAppBanner(dismissKey: string): Promise<void> {
  try {
    await AsyncStorage.setItem(`${DISMISS_PREFIX}${dismissKey}`, '1');
  } catch {
    /* ignore */
  }
}

/** Fetch active home banner; returns null when off, expired, or dismissed locally. */
export async function fetchHomeAppBanner(options?: {
  force?: boolean;
  includeDismissed?: boolean;
}): Promise<PublicAppBanner | null> {
  if (!options?.force) {
    const cached = await readCache();
    if (cached) {
      if (!cached.banner) return null;
      if (!options?.includeDismissed && (await isAppBannerDismissed(cached.banner.dismissKey))) {
        return null;
      }
      return cached.banner;
    }
  }

  let banner: PublicAppBanner | null = null;
  try {
    const res = await fetchWebApi('/api/platform/app-banner', { method: 'GET' });
    const json = (await res.json().catch(() => null)) as { banner?: unknown } | null;
    if (res.ok) {
      banner = normalizeBanner(json?.banner);
      await writeCache(banner);
    }
  } catch {
    const stale = await readCache();
    banner = stale?.banner ?? null;
  }

  if (!banner) return null;
  if (!options?.includeDismissed && (await isAppBannerDismissed(banner.dismissKey))) {
    return null;
  }
  return banner;
}
