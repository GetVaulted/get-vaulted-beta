/** Parse room-wide viewer_count broadcast from the host console. */
export function parseViewerCountBroadcast(payload: unknown): number | null {
  if (!payload || typeof payload !== "object") return null;
  const o = payload as Record<string, unknown>;
  const n = o.viewerCount ?? o.count;
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  return Math.max(0, Math.floor(n));
}

export function shouldPublishViewerCountBroadcast(args: {
  nextCount: number;
  lastCount: number | null;
  lastPublishedAtMs: number;
  nowMs: number;
  /** Min gap between publishes when the count is unchanged. */
  unchangedIntervalMs?: number;
  /** Min gap between publishes when the count changed. */
  changedIntervalMs?: number;
}): boolean {
  const unchangedIntervalMs = args.unchangedIntervalMs ?? 4_000;
  const changedIntervalMs = args.changedIntervalMs ?? 750;
  if (args.lastCount == null) return true;
  if (args.lastCount === args.nextCount) {
    return args.nowMs - args.lastPublishedAtMs >= unchangedIntervalMs;
  }
  return args.nowMs - args.lastPublishedAtMs >= changedIntervalMs;
}
