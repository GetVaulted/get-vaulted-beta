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

/**
 * Entries from big rooms are tracked once and NOT re-sent on a heartbeat (every re-send is a broadcast to
 * the whole room). They are marked `nohb: true`, and for those we trust Supabase's own disconnect cleanup
 * instead of the `at` freshness gate.
 */
export function isFreshPresenceEntry(p: Record<string, unknown>, nowMs: number, staleMs: number): boolean {
  if (p.nohb === true) return true;
  const at = typeof p.at === 'string' ? Date.parse(p.at) : NaN;
  if (!Number.isFinite(at)) return true; // no timestamp on this entry — don't penalize it
  return nowMs - at <= staleMs;
}

export type RoomPresenceSummary = {
  /** Estimated viewers: sum of per-connection weights (1 each unless the room is sampled). */
  count: number;
  /** True when any entry stands for more than one viewer (big-room sampling is active). */
  weighted: boolean;
  /** Distinct tracked connections (the sample size). */
  connections: number;
};

function presenceEntryWeight(p: Record<string, unknown>): number {
  const w = p.w;
  if (typeof w !== 'number' || !Number.isFinite(w) || w < 1) return 1;
  return Math.min(w, 1000);
}

export function summarizeRoomPresence(
  state: Record<string, unknown> | null | undefined,
  nowMs: number = Date.now(),
  staleMs: number = PRESENCE_STALE_MS,
): RoomPresenceSummary {
  if (!state || typeof state !== 'object') return { count: 0, weighted: false, connections: 0 };

  const weights = new Map<string, number>();
  for (const [stateKey, entries] of Object.entries(state)) {
    const list = Array.isArray(entries) ? entries : entries != null ? [entries] : [];
    for (const raw of list) {
      if (!raw || typeof raw !== 'object') continue;
      const p = raw as Record<string, unknown>;
      if (!isFreshPresenceEntry(p, nowMs, staleMs)) continue;
      const tabKey = typeof p.tabKey === 'string' && p.tabKey.trim() ? p.tabKey.trim() : undefined;
      const key = tabKey ?? stateKey;
      const w = presenceEntryWeight(p);
      const prev = weights.get(key);
      if (prev == null || w > prev) weights.set(key, w);
    }
  }
  let total = 0;
  let weighted = false;
  for (const w of weights.values()) {
    total += w;
    if (w > 1) weighted = true;
  }
  return { count: Math.round(total), weighted, connections: weights.size };
}

/**
 * Live viewer count = per-connection headcount (one per device/session): +1 when someone enters,
 * -1 when they leave. Each distinct presence slot counts, so the same account on two devices shows
 * as two. This is deliberately NOT the same as the roster (`parseRoomPresenceUsers`), which dedupes
 * by account. The host console tracks nothing (observe-only), so the host is never counted.
 * In a big (sampled) room each tracked connection carries a weight `w` and the count is their sum.
 */
export function countRoomPresenceViewers(
  state: Record<string, unknown> | null | undefined,
  nowMs: number = Date.now(),
  staleMs: number = PRESENCE_STALE_MS,
): number {
  return summarizeRoomPresence(state, nowMs, staleMs).count;
}
