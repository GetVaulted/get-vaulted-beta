/**
 * Big-show load shedding helpers (shared logic with `web/src/lib/live-room-scale.ts` — keep in sync).
 *
 * Why this exists: a live room is a single realtime channel. If every viewer tracks presence, re-sends
 * it on a heartbeat, reports the viewer count to the API and re-downloads the room snapshot after every
 * bid, the work grows with the SQUARE of the crowd (everyone is told about everyone) and the database
 * is hit by thousands of identical writes. Small rooms keep the exact old behaviour; once a room is
 * 'big' these helpers switch viewers to sampled / spread-out behaviour so 1,000+ viewers per show
 * (100,000 across 100 shows) cost roughly the same as ~150.
 */

/** Rooms with more viewers than this switch to sampled presence and spread-out refetching. */
export const BIG_ROOM_VIEWERS = 40;
/** A room that was big stays big until it falls below this fraction of the threshold (stops flip-flopping at the edge). */
export const BIG_ROOM_EXIT_RATIO = 0.7;
/** In a big room roughly this many viewers track presence (each carries a weight so the count stays right). */
export const PRESENCE_SAMPLE_TARGET = 100;
/** In a big room roughly this many viewers (when no host is broadcasting) report the count to the API. */
export const COUNT_REPORTER_TARGET = 3;
/** Roughly this many viewers refetch the room snapshot after a high-frequency event (bid, spot claim). */
export const RECONCILE_SAMPLE_TARGET = 150;
/** Upper bound on how far refetches are spread out in a big room. */
export const RECONCILE_MAX_SPREAD_MS = 10_000;

export function normalizeRoomSizeHint(hint: number | null | undefined): number {
  if (typeof hint !== 'number' || !Number.isFinite(hint) || hint < 0) return 0;
  return Math.floor(hint);
}

/**
 * Is this room big? Pass `wasBig` (what we decided last time) to get hysteresis: a big room only goes back to
 * 'normal' once it drops under BIG_ROOM_EXIT_RATIO of the threshold, so a room hovering near the line does not
 * make every viewer re-announce presence over and over.
 */
export function isBigRoom(hint: number | null | undefined, wasBig = false): boolean {
  const size = normalizeRoomSizeHint(hint);
  if (wasBig) return size > Math.floor(BIG_ROOM_VIEWERS * BIG_ROOM_EXIT_RATIO);
  return size > BIG_ROOM_VIEWERS;
}

/** One random number per viewer session. Reused for every sampling decision so sampling is stable. */
export function newSessionDraw(rand: () => number = Math.random): number {
  const n = rand();
  return Number.isFinite(n) ? Math.min(0.999999, Math.max(0, n)) : 0;
}

/** Probability a viewer tracks presence. 1 in a normal room; PRESENCE_SAMPLE_TARGET / size in a big one. */
export function presenceInclusionProbability(hint: number | null | undefined, wasBig = false): number {
  const size = normalizeRoomSizeHint(hint);
  if (!isBigRoom(size, wasBig)) return 1;
  return Math.min(1, PRESENCE_SAMPLE_TARGET / size);
}

/** How many viewers one tracked viewer stands for. */
export function presenceWeightFor(probability: number): number {
  if (!Number.isFinite(probability) || probability <= 0 || probability >= 1) return 1;
  return Math.round((1 / probability) * 100) / 100;
}

export type PresencePlan = { track: boolean; weight: number; quiet: boolean };

/**
 * What a viewer should do about presence right now.
 * - `track`: whether to be in the presence list at all.
 * - `weight`: how many viewers this entry represents (1 in normal rooms).
 * - `quiet`: big room — do NOT re-send presence on a heartbeat (each re-send is a broadcast to everyone).
 */
export function planPresence(draw: number, hint: number | null | undefined, wasQuiet = false): PresencePlan {
  const p = presenceInclusionProbability(hint, wasQuiet);
  const quiet = isBigRoom(hint, wasQuiet);
  if (p >= 1) return { track: true, weight: 1, quiet };
  return { track: draw < p, weight: presenceWeightFor(p), quiet };
}

/** True when `next` differs from `prev` enough to be worth re-announcing (avoids needless presence traffic). */
export function weightDriftExceeds(prev: number, next: number, ratio = 0.25): boolean {
  if (!Number.isFinite(prev) || !Number.isFinite(next) || prev <= 0) return true;
  return Math.abs(next - prev) / prev > ratio;
}

/** Best guess of room size: a fresh host broadcast wins, else the last snapshot / discovery number. */
export function resolveRoomSizeHint(args: {
  broadcastCount: number | null | undefined;
  broadcastFresh: boolean;
  snapshotHint: number | null | undefined;
}): number {
  if (args.broadcastFresh && typeof args.broadcastCount === 'number') {
    return normalizeRoomSizeHint(args.broadcastCount);
  }
  return normalizeRoomSizeHint(args.snapshotHint);
}

/**
 * Should this viewer report the room's viewer count to the API?
 * The host console always does (handled by the caller). Viewers only do it as a backup when no host
 * is broadcasting the count, and in a big room only a handful of them (~COUNT_REPORTER_TARGET).
 */
export function shouldReportViewerCount(args: {
  hint: number | null | undefined;
  draw: number;
  hostBroadcastFresh: boolean;
}): boolean {
  if (args.hostBroadcastFresh) return false;
  const size = normalizeRoomSizeHint(args.hint);
  if (size <= COUNT_REPORTER_TARGET * 4) return true;
  return args.draw < Math.min(1, COUNT_REPORTER_TARGET / size);
}

/**
 * Delay before a viewer refetches the room snapshot after a realtime event, or `null` to skip it.
 * Small rooms: unchanged `baseMs`. Big rooms: spread across a window proportional to room size so
 * 1,000 viewers do not all hit the server in the same instant; `sampleable` events (bids, spot claims —
 * the payload already carries the new state) are only refetched by ~RECONCILE_SAMPLE_TARGET viewers.
 */
export function reconcileDelayForRoom(
  baseMs: number,
  hint: number | null | undefined,
  opts: { sampleable?: boolean; rand?: () => number } = {},
): number | null {
  const rand = opts.rand ?? Math.random;
  const size = normalizeRoomSizeHint(hint);
  if (size <= BIG_ROOM_VIEWERS) return baseMs;
  if (opts.sampleable) {
    const keep = Math.min(1, RECONCILE_SAMPLE_TARGET / size);
    if (rand() >= keep) return null;
  }
  const spread = Math.min(RECONCILE_MAX_SPREAD_MS, size * 10);
  return baseMs + Math.round(rand() * spread);
}

/**
 * Poll interval for a big room while realtime is connected. Realtime carries the changes; the poll is only
 * a safety net, so it can stretch as the crowd grows (up to `maxFactor` x). Never call this while realtime
 * is down — a disconnected viewer must keep the normal (faster) fallback poll.
 */
export function bigRoomPollMs(baseMs: number, hint: number | null | undefined, maxFactor = 6): number {
  const size = normalizeRoomSizeHint(hint);
  if (size <= BIG_ROOM_VIEWERS) return baseMs;
  const factor = Math.min(maxFactor, 1 + size / 150);
  return Math.round(baseMs * factor);
}

/** `baseMs` +/- `spread` (0.2 = 20%) so viewers that started together do not poll in lockstep. */
export function jitteredDelayMs(baseMs: number, spread = 0.2, rand: () => number = Math.random): number {
  const factor = 1 - spread + rand() * spread * 2;
  return Math.max(0, Math.round(baseMs * factor));
}

/** Exponential smoothing for sampled (weighted) viewer counts so the number does not twitch. */
export function smoothWeightedCount(prev: number | null, raw: number, alpha = 0.35): number {
  const r = Math.max(0, raw);
  if (prev == null || !Number.isFinite(prev)) return Math.round(r);
  return Math.round(prev + (r - prev) * alpha);
}

/**
 * How often the host console broadcasts the viewer count to the room. Every broadcast is delivered to EVERY viewer,
 * so a 1,000 viewer room costs 1,000 messages per broadcast. Normal rooms keep the old cadence (4-5s keep-alive,
 * 750ms on change). Big rooms spread it out in proportion to the crowd (about 33ms per viewer: 1,000 viewers = 30s,
 * capped at 30s, never faster than 5s) so a growing crowd does not make the count broadcast the biggest cost.
 */
export const HOST_COUNT_NORMAL_UNCHANGED_MS = 5_000;
export const HOST_COUNT_NORMAL_CHANGED_MS = 750;
export const HOST_COUNT_BIG_MIN_MS = 5_000;
export const HOST_COUNT_BIG_MAX_MS = 30_000;
export const HOST_COUNT_MS_PER_VIEWER = 33;
/** Viewers keep trusting a host count for this many publish intervals before falling back to their own estimate. */
export const HOST_COUNT_FRESH_INTERVALS = 2.5;
export const HOST_COUNT_NORMAL_FRESH_MS = 12_000;

export function hostCountPublishPlan(hint: number | null | undefined): { unchangedMs: number; changedMs: number } {
  const size = normalizeRoomSizeHint(hint);
  if (!isBigRoom(size)) {
    return { unchangedMs: HOST_COUNT_NORMAL_UNCHANGED_MS, changedMs: HOST_COUNT_NORMAL_CHANGED_MS };
  }
  const ms = Math.min(
    HOST_COUNT_BIG_MAX_MS,
    Math.max(HOST_COUNT_BIG_MIN_MS, Math.round(size * HOST_COUNT_MS_PER_VIEWER)),
  );
  return { unchangedMs: ms, changedMs: ms };
}

/**
 * How long a viewer trusts the last host count broadcast. Must stay comfortably longer than the host's publish
 * interval for a room of that size, otherwise viewers would keep thinking the host went quiet.
 */
export function hostCountFreshMs(lastBroadcastCount: number | null | undefined): number {
  if (!isBigRoom(lastBroadcastCount)) return HOST_COUNT_NORMAL_FRESH_MS;
  const { unchangedMs } = hostCountPublishPlan(lastBroadcastCount);
  return Math.max(HOST_COUNT_NORMAL_FRESH_MS, Math.round(unchangedMs * HOST_COUNT_FRESH_INTERVALS));
}
