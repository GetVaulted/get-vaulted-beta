/**
 * Some server error strings are written for engineers debugging local/staging environments
 * (e.g. "Stripe is not configured. Add test keys to .env (see .env.example).") and should
 * never reach a real customer mid-checkout — it's confusing and erodes trust at the highest
 * -stakes moment in the app. This maps any error string that looks internal/developer-facing
 * to a calm, generic message while leaving normal validation errors ("Enter a valid email.")
 * untouched.
 */
const INTERNAL_ERROR_PATTERNS = [/\.env/i, /not configured/i, /STRIPE_NOT_CONFIGURED/i];

export function toUserFacingErrorMessage(raw: string | null | undefined, fallback: string): string {
  const trimmed = raw?.trim();
  if (!trimmed) return fallback;
  if (INTERNAL_ERROR_PATTERNS.some((pattern) => pattern.test(trimmed))) return fallback;
  return trimmed;
}
