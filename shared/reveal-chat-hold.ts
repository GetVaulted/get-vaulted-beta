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
