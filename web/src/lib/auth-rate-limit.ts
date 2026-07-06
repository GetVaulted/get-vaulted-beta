import { checkRateLimit } from "@/lib/request-rate-limit";

/**
 * Per-account attempt limiter for credential/verification-code guessing. Keyed by the
 * normalized email so an attacker can't bypass it by rotating IPs, and scoped separately
 * per `scope` so e.g. login attempts don't share a budget with verify-email attempts.
 *
 * Deliberately generous enough to not lock out a real user who mistypes a password or
 * verification code a few times, while making brute force (password guessing, or guessing
 * a 6-digit/1,000,000-space verification code) impractical: 10 attempts / 15 minutes caps an
 * attacker at ~1,000 guesses/day against a single account.
 */
export function checkAuthAttemptRateLimit(
  scope: "login" | "verify-email",
  email: string,
): { ok: true } | { ok: false; retryAfterMs: number } {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return { ok: true };
  const result = checkRateLimit(`auth:${scope}:${normalized}`, { limit: 10, windowMs: 15 * 60 * 1000 });
  if (result.ok) return { ok: true };
  return { ok: false, retryAfterMs: result.retryAfterMs };
}
