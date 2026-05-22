export type LiveDiscoverySource = 'next_api' | 'supabase_fallback' | 'none' | 'cache';

export type LiveDiscoveryMeta = {
  source: LiveDiscoverySource;
  fetchedAt: number | null;
  apiBaseUrl: string | null;
  error: string | null;
};

let meta: LiveDiscoveryMeta = {
  source: 'none',
  fetchedAt: null,
  apiBaseUrl: null,
  error: null,
};

const listeners = new Set<() => void>();

export function getLiveDiscoveryMeta(): LiveDiscoveryMeta {
  return meta;
}

export function setLiveDiscoveryMeta(next: Partial<LiveDiscoveryMeta>): void {
  meta = { ...meta, ...next };
  for (const l of listeners) {
    try {
      l();
    } catch {
      /* ignore */
    }
  }
}

export function subscribeLiveDiscoveryMeta(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function formatLiveDiscoveryMetaLine(m: LiveDiscoveryMeta = meta): string {
  const src =
    m.source === 'next_api'
      ? 'API'
      : m.source === 'supabase_fallback'
        ? 'Supabase (legacy)'
        : m.source === 'cache'
          ? 'Cache'
          : '—';
  const at = m.fetchedAt ? new Date(m.fetchedAt).toLocaleTimeString() : 'never';
  const base = m.apiBaseUrl ?? 'no API base';
  const err = m.error ? ` · ${m.error}` : '';
  return `Discovery: ${src} · ${at} · ${base}${err}`;
}
