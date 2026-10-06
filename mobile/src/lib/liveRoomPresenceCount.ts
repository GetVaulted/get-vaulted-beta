/**
 * A presence entry only counts if its own `at` timestamp (stamped on every `track()` call,
 * including the 45s keep-alive heartbeat) is recent. Without this, a viewer whose client never
 * got the chance to call `untrack()` — crashed, force-closed, or backgrounded on a build that
 * predates the untrack-on-background fix — stays counted forever, because Supabase only drops a
 * presence entry once it notices the underlying socket itself disconnected, which can lag far
 * behind reality (this is what produced viewer counts inflated well beyond who was actually
 * watching). 120s allows two missed heartbeats — reconnect jitter, a brief network blip — before
 * we stop trusting an entry.
 */
export const PRESENCE_STALE_MS = 120_000;

export function isFreshPresenceEntry(p: Record<string, unknown>, nowMs: number, staleMs: number): boolean {
  const at = typeof p.at === 'string' ? Date.parse(p.at) : NaN;
  if (!Number.isFinite(at)) return true; // no timestamp on this entry — don't penalize it
  return nowMs - at <= staleMs;
}

/**
 * Live viewer count = per-connection headcount (one per device/session): +1 when someone enters,
 * -1 when they leave. Each distinct presence slot counts, so the same account on two devices shows
 * as two. This is deliberately NOT the roster (`parseRoomPresenceUsers`), which dedupes by account.
 * The host console tracks nothing (observe-only), so the host is never counted.
 */
export function countRoomPresenceViewers(
  state: Record<string, unknown> | null | undefined,
  nowMs: number = Date.now(),
  staleMs: number = PRESENCE_STALE_MS,
): number {
  if (!state || typeof state !== 'object') return 0;

  const connections = new Set<string>();
  for (const [stateKey, entries] of Object.entries(state)) {
    const list = Array.isArray(entries) ? entries : entries != null ? [entries] : [];
    for (const raw of list) {
      if (!raw || typeof raw !== 'object') continue;
      const p = raw as Record<string, unknown>;
      if (!isFreshPresenceEntry(p, nowMs, staleMs)) continue;
      const tabKey = typeof p.tabKey === 'string' && p.tabKey.trim() ? p.tabKey.trim() : undefined;
      connections.add(tabKey ?? stateKey);
    }
  }
  return connections.size;
}
