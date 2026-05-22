import { getWebApiBaseUrl } from '../lib/webApiBaseUrl';

export type LiveDiscoveryProbeResult = {
  url: string;
  status: number;
  ok: boolean;
  snippet: string;
  json: Record<string, unknown> | null;
};

async function probeUrl(path: string): Promise<LiveDiscoveryProbeResult> {
  const base = getWebApiBaseUrl();
  if (!base) {
    return { url: path, status: 0, ok: false, snippet: 'EXPO_PUBLIC_SITE_URL not set', json: null };
  }
  const url = `${base}${path}`;
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-GV-Client': 'getvaulted-mobile',
    'User-Agent': 'GetVaultedMobile/1.0 (Expo)',
  };
  const basic = process.env.EXPO_PUBLIC_BETA_HTTP_BASIC?.trim();
  if (basic) headers.Authorization = basic.startsWith('Basic ') ? basic : `Basic ${basic}`;

  const res = await fetch(url, { headers, cache: 'no-store' });
  const text = await res.text();
  let json: Record<string, unknown> | null = null;
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    /* non-JSON (edge HTML) */
  }
  return {
    url,
    status: res.status,
    ok: res.ok,
    snippet: text.slice(0, 160).replace(/\s+/g, ' '),
    json,
  };
}

/** Human-readable one-liner; safe when probe partial/failed. */
export function formatLiveDiscoveryProbeLine(
  probe: { health?: LiveDiscoveryProbeResult | null; rooms?: LiveDiscoveryProbeResult | null } | null,
): string | null {
  if (!probe) return null;
  const healthStatus = probe.health?.status ?? '—';
  const roomsStatus = probe.rooms?.status ?? '—';
  let line = `health ${healthStatus} · rooms ${roomsStatus}`;
  if (roomsStatus === 403 && healthStatus === 200) {
    line += ' — edge/WAF blocking /api/live-rooms only';
  } else if (roomsStatus === 403) {
    line += ' — edge 403 before Next.js (visitor/WAF)';
  } else if (healthStatus === 404) {
    line += ' — deploy /api/health/live-discovery to beta';
  }
  return line;
}

/** Device-side probe to distinguish edge 403 vs app route failures. */
export async function probeLiveDiscoveryFromDevice(): Promise<{
  health: LiveDiscoveryProbeResult;
  rooms: LiveDiscoveryProbeResult;
}> {
  const [health, rooms] = await Promise.all([
    probeUrl('/api/health/live-discovery'),
    probeUrl('/api/live-rooms?limit=5'),
  ]);
  return { health, rooms };
}
