/**
 * Guardrails for chance-based live purchases (Random Team / Division / Player and Surprise Sets).
 *
 * - Buyers must confirm they are 18 or older before their first random purchase.
 * - Per-buyer limits over a rolling 24 hours: a daily cap, plus a short cooling-off pause after
 *   every `RANDOM_PURCHASE_COOLING_EVERY` purchases.
 *
 * Pure functions only — the purchase route supplies the recent-purchase timestamps. Tune the
 * constants below to change the limits; nothing else needs to move.
 */

export const RANDOM_PURCHASE_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Most random / surprise units one buyer may purchase in any rolling 24 hours. */
export const RANDOM_PURCHASE_DAILY_CAP = 20;
/** After every this-many purchases in the window, the buyer must wait out a cooling-off pause. */
export const RANDOM_PURCHASE_COOLING_EVERY = 10;
export const RANDOM_PURCHASE_COOLING_MS = 15 * 60 * 1000;

export type RandomPurchaseLimitResult =
  | { allowed: true }
  | {
      allowed: false;
      code: "RANDOM_PURCHASE_DAILY_CAP" | "RANDOM_PURCHASE_COOLING_OFF";
      message: string;
      /** When the buyer may try again (cooling-off) or when the oldest purchase leaves the window. */
      retryAt: Date;
    };

function formatWait(ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.ceil(minutes / 60);
  return `about ${hours} hour${hours === 1 ? "" : "s"}`;
}

/**
 * @param recentPurchaseTimes creation times of this buyer's random/surprise purchases that are
 *   paid or still awaiting payment (an abandoned checkout is not counted once it expires).
 */
export function evaluateRandomPurchaseLimits(
  recentPurchaseTimes: ReadonlyArray<Date>,
  now: Date = new Date(),
): RandomPurchaseLimitResult {
  const cutoff = now.getTime() - RANDOM_PURCHASE_WINDOW_MS;
  const inWindow = recentPurchaseTimes
    .map((d) => d.getTime())
    .filter((t) => t > cutoff)
    .sort((a, b) => a - b);
  const count = inWindow.length;

  if (count >= RANDOM_PURCHASE_DAILY_CAP) {
    // The cap frees up when enough old purchases age out of the window.
    const freesAt = inWindow[count - RANDOM_PURCHASE_DAILY_CAP]! + RANDOM_PURCHASE_WINDOW_MS;
    return {
      allowed: false,
      code: "RANDOM_PURCHASE_DAILY_CAP",
      message: `You've reached the limit of ${RANDOM_PURCHASE_DAILY_CAP} random purchases in 24 hours. You can buy again in ${formatWait(freesAt - now.getTime())}.`,
      retryAt: new Date(freesAt),
    };
  }

  if (count > 0 && count % RANDOM_PURCHASE_COOLING_EVERY === 0) {
    const last = inWindow[count - 1]!;
    const until = last + RANDOM_PURCHASE_COOLING_MS;
    if (until > now.getTime()) {
      return {
        allowed: false,
        code: "RANDOM_PURCHASE_COOLING_OFF",
        message: `Take a short break — you've made ${count} random purchases. You can buy again in ${formatWait(until - now.getTime())}.`,
        retryAt: new Date(until),
      };
    }
  }

  return { allowed: true };
}

export const ADULT_CONFIRMATION_REQUIRED_MESSAGE =
  "Confirm you are 18 or older to buy a random reveal.";

/** Copy shown to buyers next to every random purchase. Keep in sync with mobile. */
export const RANDOM_REVEAL_DISCLOSURE =
  "This is a random draw. You don't choose what you get, and what you receive can be worth more or less than what you pay.";
