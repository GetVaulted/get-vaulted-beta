/**
 * When Resend is not configured, the register and resend-verification APIs may echo a
 * one-time code for **local automation only**. Never enabled on production deploys.
 */
export function isApiDevVerificationAssistAllowed(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  if (process.env.VERCEL_ENV === "production") return false;
  if (process.env.ALLOW_DEV_VERIFICATION_ASSIST === "0") return false;
  return true;
}

let loggedSkipVerificationEmail = false;

/**
 * TEMPORARY local-only: skip calling Resend even when `RESEND_API_KEY` is set (e.g. fake
 * inboxes). The APIs still return `_localDevVerificationCode` when
 * {@link isApiDevVerificationAssistAllowed} is true — same as having no Resend key.
 *
 * Set in `.env.local`: `GV_DEV_SKIP_VERIFICATION_EMAIL=1` (exact). Remove before real
 * email testing. Forced off in production.
 */
export function isDevSkipVerificationEmail(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  if (process.env.VERCEL_ENV === "production") return false;
  if (process.env.GV_DEV_SKIP_VERIFICATION_EMAIL?.trim() !== "1") return false;
  if (!loggedSkipVerificationEmail) {
    loggedSkipVerificationEmail = true;
    console.warn(
      "[GV_DEV_SKIP_VERIFICATION_EMAIL] Resend is bypassed; codes are returned as _localDevVerificationCode only. Remove this flag when testing real email delivery.",
    );
  }
  return true;
}

/** Client may show a dev-only hint only in development bundles. */
export function isClientDevVerificationUiAllowed(): boolean {
  return process.env.NODE_ENV === "development";
}
