export function isLiveDebugEnabled(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  return process.env.NEXT_PUBLIC_LIVE_DEBUG === "true";
}

export function logLiveDebugEvent(args: {
  event: string;
  roomId: string;
  lastRefreshAtMs?: number | null;
  extra?: Record<string, unknown>;
}): void {
  if (!isLiveDebugEnabled()) return;
  const now = Date.now();
  const sinceRefresh =
    typeof args.lastRefreshAtMs === "number" && Number.isFinite(args.lastRefreshAtMs)
      ? now - args.lastRefreshAtMs
      : null;
  const payload: Record<string, unknown> = {
    event: args.event,
    roomId: args.roomId,
    timestamp: new Date(now).toISOString(),
    msSinceLastRoomRefresh: sinceRefresh,
    ...(args.extra ?? {}),
  };
  console.info("[LIVE_DEBUG]", payload);
}
