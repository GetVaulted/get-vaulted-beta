/**
 * Poll timing helpers for live-room clients.
 *
 * Why this exists: every viewer's phone falls back to polling the room snapshot when its realtime
 * connection is down. If realtime is degraded for many people at once (an outage, or the realtime
 * service hitting a connection cap during a huge show), a fixed short interval makes every one of
 * them hit the heaviest endpoint on the same beat. Backoff spreads that out, and jitter stops
 * clients that started together from staying in lockstep.
 */

/** `baseMs` ± `spread` (0.2 = ±20%). Pass `rand` for deterministic tests. */
export function jitteredMs(baseMs: number, spread = 0.2, rand: () => number = Math.random): number {
  const factor = 1 - spread + rand() * spread * 2;
  return Math.max(0, Math.round(baseMs * factor));
}

/**
 * Delay before the next fallback poll after `attempt` consecutive polls while disconnected
 * (0 = first). Grows 1.5x per attempt from `baseMs` up to `maxMs`, then jittered.
 */
export function nextFallbackPollDelayMs(
  attempt: number,
  baseMs = 5_000,
  maxMs = 20_000,
  rand: () => number = Math.random,
): number {
  const grown = Math.min(maxMs, baseMs * Math.pow(1.5, Math.max(0, attempt)));
  return jitteredMs(grown, 0.2, rand);
}
