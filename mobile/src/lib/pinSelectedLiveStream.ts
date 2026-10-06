import type { LiveStream } from '../types';

/**
 * Keep the room the buyer tapped at a stable index (front of the feed).
 * Only use on first open / streamId change — not on every discovery refresh
 * (mid-session re-pinning reorders under the pager and feels like a random swipe).
 */
export function pinSelectedLiveStream(
  streams: LiveStream[],
  selectedId: string | null | undefined,
): LiveStream[] {
  const id = selectedId?.trim();
  if (!id || streams.length < 2) return streams;
  const index = streams.findIndex((s) => s.id === id);
  if (index <= 0) return streams;
  const selected = streams[index]!;
  return [selected, ...streams.slice(0, index), ...streams.slice(index + 1)];
}

/**
 * Refresh metadata without reshuffling the vertical feed.
 * Keeps the buyer's current order; updates rows in place; appends newly discovered rooms.
 */
export function mergeLiveFeedStreams(prev: LiveStream[], next: LiveStream[]): LiveStream[] {
  if (!prev.length) return next;
  if (!next.length) return prev;
  const nextById = new Map(next.map((s) => [s.id, s]));
  const seen = new Set<string>();
  const merged: LiveStream[] = [];
  for (const row of prev) {
    const updated = nextById.get(row.id);
    if (!updated) continue;
    merged.push(updated);
    seen.add(row.id);
  }
  for (const row of next) {
    if (seen.has(row.id)) continue;
    merged.push(row);
  }
  return merged;
}

/**
 * After a streams list replace, return the page index to snap to — or `null` if the
 * current page already shows `keepStreamId` (do not touch the native pager).
 */
export function resolveLiveFeedPageCorrection(args: {
  streams: LiveStream[];
  currentPage: number;
  keepStreamId: string | null | undefined;
}): number | null {
  const keepId = args.keepStreamId?.trim();
  if (!keepId || args.streams.length === 0) return null;
  const atPage = args.streams[args.currentPage]?.id;
  if (atPage === keepId) return null;
  const idx = args.streams.findIndex((s) => s.id === keepId);
  return idx >= 0 ? idx : null;
}

/** @deprecated Prefer resolveLiveFeedPageCorrection — avoids fallback jumps to the wrong room. */
export function resolveLiveFeedPageAfterStreamsChange(args: {
  streams: LiveStream[];
  keepStreamId: string | null | undefined;
  fallbackIndex: number;
}): number {
  const correction = resolveLiveFeedPageCorrection({
    streams: args.streams,
    currentPage: args.fallbackIndex,
    keepStreamId: args.keepStreamId,
  });
  if (correction != null) return correction;
  if (args.streams.length === 0) return 0;
  const fallback = args.fallbackIndex;
  if (fallback >= 0 && fallback < args.streams.length) return fallback;
  return 0;
}
