/**
 * Random reveals (Surprise Set card, random-team wheel) post a system chat line "@buyer got X"
 * the moment the server draws — i.e. before viewers' reveal animation has finished, spoiling it.
 * Clients hold those lines back while that buyer's reveal is still playing.
 *
 * Keep this file dependency-free (shared by web and mobile).
 */

/** Extra time after the animation ends before the line shows. */
export const REVEAL_CHAT_HOLD_TAIL_MS = 400;
/** Safety cap so a stuck/missed reveal can never hide a chat line for long. */
export const REVEAL_CHAT_HOLD_MAX_MS = 15_000;

export type RevealChatHolds = Map<string, number>;

function normBuyer(name: string | null | undefined): string {
  return (name ?? '').replace(/^@+/, '').trim().toLowerCase();
}

/** Hold "@buyer got …" lines until `now + durationMs` (+ tail), capped. Returns the release time. */
export function addRevealChatHold(
  holds: RevealChatHolds,
  buyerUsername: string | null | undefined,
  durationMs: number,
  nowMs: number,
): number | null {
  const key = normBuyer(buyerUsername);
  if (!key) return null;
  const ms = Math.min(REVEAL_CHAT_HOLD_MAX_MS, Math.max(0, durationMs) + REVEAL_CHAT_HOLD_TAIL_MS);
  const until = nowMs + ms;
  const prev = holds.get(key) ?? 0;
  if (until > prev) holds.set(key, until);
  return holds.get(key)!;
}

/** Release a buyer's hold shortly (the reveal was dismissed / finished). */
export function releaseRevealChatHold(
  holds: RevealChatHolds,
  buyerUsername: string | null | undefined,
  nowMs: number,
): void {
  const key = normBuyer(buyerUsername);
  if (!key || !holds.has(key)) return;
  holds.set(key, Math.min(holds.get(key)!, nowMs + REVEAL_CHAT_HOLD_TAIL_MS));
}

const GOT_LINE = /^@([^\s]+) got /;

/** Buyer named by a reveal chat line ("@bob got Chase"), or null for any other message. */
export function revealChatLineBuyer(body: string | null | undefined): string | null {
  if (typeof body !== 'string') return null;
  const m = GOT_LINE.exec(body.trim());
  return m ? normBuyer(m[1]) : null;
}

/** True while this message should stay hidden because its buyer's reveal is still playing. */
export function isRevealChatLineHeld(
  holds: RevealChatHolds,
  message: { body?: string | null; messageType?: string | null },
  nowMs: number,
): boolean {
  if (holds.size === 0) return false;
  if (message.messageType && message.messageType !== 'system') return false;
  const buyer = revealChatLineBuyer(message.body);
  if (!buyer) return false;
  const until = holds.get(buyer);
  return until != null && nowMs < until;
}

/** Earliest future release time across all holds (for scheduling a re-render), or null. */
export function nextRevealChatRelease(holds: RevealChatHolds, nowMs: number): number | null {
  let next: number | null = null;
  for (const [key, until] of holds) {
    if (until <= nowMs) {
      holds.delete(key);
      continue;
    }
    if (next == null || until < next) next = until;
  }
  return next;
}

/**
 * A fresh "@buyer got X" line that arrives before that buyer's reveal has reached this screen
 * (realtime events can land in either order, or in the same render) is held this long while we
 * wait for the reveal. If the reveal shows up, the hold is extended to cover the animation.
 */
export const REVEAL_CHAT_PENDING_GRACE_MS = 2500;
/** Lines already in the chat when the screen opens are history — never hold those. */
export const REVEAL_CHAT_WARMUP_MS = 1500;

type GateSpin = { spinId: string; buyerUsername?: string | null };

/**
 * Stateful filter used by the web and mobile hooks. Call `visible()` on every render with the
 * current messages and active reveal; call `nextWakeAt()` to know when to re-render.
 */
export class RevealChatGate {
  private holds: RevealChatHolds = new Map();
  private shown = new Set<string>();
  private pending = new Map<string, number>();
  private spinId: string | null = null;
  private spinBuyer: string | null = null;
  private readonly startedAt: number;

  constructor(nowMs: number) {
    this.startedAt = nowMs;
  }

  /** Start (or extend) a hold for a buyer — e.g. right after they buy, before the spin arrives. */
  holdBuyer(username: string | null | undefined, durationMs: number, nowMs: number): void {
    addRevealChatHold(this.holds, username, durationMs, nowMs);
  }

  /** Register the reveal currently on screen (null when none). `durationMs` = its animation length. */
  syncSpin(spin: GateSpin | null, durationMs: number, nowMs: number): void {
    const id = spin?.spinId ?? null;
    if (id === this.spinId) return;
    if (this.spinBuyer) releaseRevealChatHold(this.holds, this.spinBuyer, nowMs);
    this.spinId = id;
    this.spinBuyer = spin?.buyerUsername ? normBuyer(spin.buyerUsername) : null;
    if (spin && this.spinBuyer) addRevealChatHold(this.holds, this.spinBuyer, durationMs, nowMs);
  }

  visible<T extends { id: string }>(
    messages: T[],
    read: (m: T) => { body?: string | null; messageType?: string | null },
    nowMs: number,
  ): T[] {
    const warm = nowMs - this.startedAt >= REVEAL_CHAT_WARMUP_MS;
    let changed = false;
    const out: T[] = [];
    for (const m of messages) {
      if (this.shown.has(m.id)) {
        out.push(m);
        continue;
      }
      const line = read(m);
      const buyer =
        !line.messageType || line.messageType === 'system' ? revealChatLineBuyer(line.body) : null;
      if (buyer && warm) {
        const held = isRevealChatLineHeld(this.holds, line, nowMs);
        if (held) {
          changed = true;
          continue;
        }
        // No reveal seen for this buyer yet: wait briefly in case it is about to arrive.
        const firstSeen = this.pending.get(m.id) ?? nowMs;
        if (!this.pending.has(m.id)) this.pending.set(m.id, firstSeen);
        const reveal = this.spinBuyer === buyer || this.holds.has(buyer);
        if (!reveal && nowMs - firstSeen < REVEAL_CHAT_PENDING_GRACE_MS) {
          changed = true;
          continue;
        }
      }
      this.pending.delete(m.id);
      this.shown.add(m.id);
      out.push(m);
    }
    return changed || out.length !== messages.length ? out : messages;
  }

  /** When something held should next be re-checked (ms epoch), or null if nothing is held. */
  nextWakeAt(nowMs: number): number | null {
    let next = nextRevealChatRelease(this.holds, nowMs);
    for (const first of this.pending.values()) {
      const at = first + REVEAL_CHAT_PENDING_GRACE_MS;
      if (at > nowMs && (next == null || at < next)) next = at;
    }
    return next;
  }
}
