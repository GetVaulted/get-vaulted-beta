/**
 * Live viewer count = per-connection headcount (one per device/session): +1 when someone enters,
 * -1 when they leave. Each distinct presence slot counts, so the same account on two devices shows
 * as two. This is deliberately NOT the roster (`parseRoomPresenceUsers`), which dedupes by account.
 * The host console tracks nothing (observe-only), so the host is never counted.
 */
export function countRoomPresenceViewers(state: Record<string, unknown> | null | undefined): number {
  if (!state || typeof state !== 'object') return 0;

  const connections = new Set<string>();
  for (const [stateKey, entries] of Object.entries(state)) {
    const list = Array.isArray(entries) ? entries : entries != null ? [entries] : [];
    for (const raw of list) {
      if (!raw || typeof raw !== 'object') continue;
      const p = raw as Record<string, unknown>;
      const tabKey = typeof p.tabKey === 'string' && p.tabKey.trim() ? p.tabKey.trim() : undefined;
      connections.add(tabKey ?? stateKey);
    }
  }
  return connections.size;
}
