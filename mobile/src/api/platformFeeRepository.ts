import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchWebApi } from './webListingsRepository';

export type PlatformMarketplaceFeePolicy = {
  platformFeePercent: number;
  feeRateLabel: string;
};

export const DEFAULT_PLATFORM_MARKETPLACE_FEE_POLICY: PlatformMarketplaceFeePolicy = {
  platformFeePercent: 8,
  feeRateLabel: '8% of total sales',
};

const CACHE_KEY = 'gv:platform-marketplace-fee:v1';
const CACHE_TTL_MS = 5 * 60 * 1000;

type CachedPolicy = PlatformMarketplaceFeePolicy & { fetchedAt: number };

export function formatVaultedFeeRateLabel(platformFeePercent: number): string {
  const pct = Number.isFinite(platformFeePercent) ? platformFeePercent : DEFAULT_PLATFORM_MARKETPLACE_FEE_POLICY.platformFeePercent;
  const formatted = Number.isInteger(pct) ? String(pct) : pct.toFixed(2).replace(/\.?0+$/, '');
  return `${formatted}% of total sales`;
}

function normalizePolicy(body: unknown): PlatformMarketplaceFeePolicy | null {
  if (!body || typeof body !== 'object') return null;
  const o = body as { platformFeePercent?: unknown; feeRateLabel?: unknown };
  const platformFeePercent = Number(o.platformFeePercent);
  if (!Number.isFinite(platformFeePercent) || platformFeePercent < 0) return null;
  const feeRateLabel =
    typeof o.feeRateLabel === 'string' && o.feeRateLabel.trim()
      ? o.feeRateLabel.trim()
      : formatVaultedFeeRateLabel(platformFeePercent);
  return { platformFeePercent, feeRateLabel };
}

async function readCachedPolicy(): Promise<CachedPolicy | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedPolicy;
    if (!parsed || typeof parsed.fetchedAt !== 'number') return null;
    if (Date.now() - parsed.fetchedAt > CACHE_TTL_MS) return null;
    if (!Number.isFinite(parsed.platformFeePercent)) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeCachedPolicy(policy: PlatformMarketplaceFeePolicy): Promise<void> {
  try {
    const payload: CachedPolicy = { ...policy, fetchedAt: Date.now() };
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    // ignore cache write failures
  }
}

export async function fetchPlatformMarketplaceFeePolicy(options?: {
  force?: boolean;
}): Promise<PlatformMarketplaceFeePolicy> {
  if (!options?.force) {
    const cached = await readCachedPolicy();
    if (cached) {
      return {
        platformFeePercent: cached.platformFeePercent,
        feeRateLabel: cached.feeRateLabel,
      };
    }
  }

  try {
    const res = await fetchWebApi('/api/platform/marketplace-fee', { method: 'GET' });
    const body = await res.json().catch(() => null);
    const policy = normalizePolicy(body);
    if (res.ok && policy) {
      await writeCachedPolicy(policy);
      return policy;
    }
  } catch {
    // fall through to default
  }

  const cachedStale = await (async () => {
    try {
      const raw = await AsyncStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      return normalizePolicy(JSON.parse(raw));
    } catch {
      return null;
    }
  })();

  return cachedStale ?? DEFAULT_PLATFORM_MARKETPLACE_FEE_POLICY;
}
