/**
 * Turns a raw caught error into copy that's safe to show a user directly.
 *
 * Several screens (message inbox/thread, sign-up, etc.) fall back to a caught error's own
 * `.message` when nothing more specific applies. That previously leaked raw transport/config
 * detail straight into the UI — e.g. "TypeError: Network request failed", "Could not reach the
 * Vaulted API at https://beta.shopgetvaulted.com. Check your connection and env.", or a timeout
 * message with a raw URL in it. None of that is something a buyer or seller should ever see.
 *
 * Anything that looks like a raw transport/timeout/host-config error gets swapped for plain,
 * professional copy. Anything else (a deliberately-authored API error message, e.g. a validation
 * message) passes through unchanged, since that text was written to be user-facing already.
 */
const RAW_TRANSPORT_PATTERNS = [
  /network request failed/i,
  /failed to fetch/i,
  /could not reach/i,
  /getaddrinfo|enotfound|econnrefused|econnreset|etimedout/i,
  /socket hang up/i,
  /\bdns\b/i,
  /timed out/i,
  /\baborted\b/i,
  /check your connection/i,
  /EXPO_PUBLIC_/,
  /invalid api key/i,
];

export const CONNECTION_ERROR_MESSAGE = 'Network error. Please check your connection and try again.';

export function looksLikeRawTransportError(text: string): boolean {
  return RAW_TRANSPORT_PATTERNS.some((p) => p.test(text));
}

export function friendlyErrorText(e: unknown, fallback: string): string {
  const raw = e instanceof Error ? e.message.trim() : '';
  if (!raw) return fallback;
  return looksLikeRawTransportError(raw) ? CONNECTION_ERROR_MESSAGE : raw;
}
