/** User-facing payment failure copy — never expose raw Stripe / internal errors. */

const CODE_MESSAGES: Record<string, string> = {
  card_declined: 'Your card was declined.',
  card_declined_insufficient_funds: 'Insufficient funds.',
  insufficient_funds: 'Insufficient funds.',
  expired_card: 'Your card has expired.',
  processing_error: 'Payment could not be completed.',
  incorrect_cvc: 'Your card security code is incorrect.',
  incorrect_number: 'Your card number is incorrect.',
  invalid_expiry_month: 'Your card expiration date is invalid.',
  invalid_expiry_year: 'Your card expiration date is invalid.',
  authentication_required: 'Your bank requires additional verification.',
  card_declined_authentication_required: 'Your bank requires additional verification.',
  CARD_DECLINED: 'Your card was declined.',
  // Order-level payment window lapsed — NOT a card-expiry problem; must not map to "card has expired".
  ORDER_PAYMENT_EXPIRED: "This purchase's payment window expired. Please try again or contact support.",
  order_payment_expired: "This purchase's payment window expired. Please try again or contact support.",
};

const INTERNAL_PATTERN =
  /stripe|payment_intent|payment method id|api key|secret key|webhook|prisma|sql|undefined|null/i;

function normalizeCode(raw: string | null | undefined): string {
  return (raw ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function looksInternal(raw: string): boolean {
  const t = raw.trim();
  if (!t) return false;
  if (INTERNAL_PATTERN.test(t)) return true;
  if (/^error[:\s]/i.test(t)) return true;
  if (t.includes(' at ') && t.includes('.ts')) return true;
  return t.length > 96;
}

/**
 * Map API / Stripe codes and raw messages to buyer-safe copy.
 * Fallback: "Your payment method needs attention."
 */
export function mapLivePaymentFailureMessage(
  raw?: string | null,
  code?: string | null,
): string {
  const codeKey = normalizeCode(code);
  if (codeKey && CODE_MESSAGES[codeKey]) return CODE_MESSAGES[codeKey];
  const upperCode = (code ?? '').trim();
  if (upperCode && CODE_MESSAGES[upperCode]) return CODE_MESSAGES[upperCode];

  const text = (raw ?? '').trim();
  if (!text) return 'Your payment method needs attention.';

  const textAsCode = normalizeCode(text);
  if (CODE_MESSAGES[textAsCode]) return CODE_MESSAGES[textAsCode];

  const lower = text.toLowerCase();
  if (lower.includes('declined')) return 'Your card was declined.';
  if (lower.includes('insufficient')) return 'Insufficient funds.';
  if (lower.includes('expired')) return 'Your card has expired.';
  if (lower.includes('processing')) return 'Payment could not be completed.';
  if (lower.includes('verification') || lower.includes('authentication')) {
    return 'Your bank requires additional verification.';
  }
  if (lower.includes('network')) return 'Network error — try again.';

  if (looksInternal(text)) return 'Your payment method needs attention.';

  // Allow short server-authored sentences (already mapped on web).
  if (text.length <= 72 && !text.includes('_') && /[.!?]$/.test(text)) return text;

  return 'Your payment method needs attention.';
}

/**
 * After a new card is saved, surface the real finalize/retry failure by HTTP status instead of the
 * stale "Your card has expired" reason from the original failure snapshot.
 *   401 = session expired · 400 = card save did not return a payment method · 5xx = retry failed
 */
export function recoveryStatusMessage(status: number | null | undefined): string | null {
  if (status == null) return null;
  if (status === 401 || status === 403) return 'Your session expired — sign in again to finish.';
  if (status === 400) return 'Card save did not return a payment method. Try again.';
  // 402 = the charge attempt failed with a specific decline/order reason in the body.
  // Defer to that reason (e.g. card declined, payment window expired) instead of a generic line.
  if (status === 402) return null;
  if (status >= 500) return 'Payment retry failed. Please try again.';
  return null;
}

export const PAYMENT_RECOVERY_SUCCESS_TOAST = "Payment successful — you're back in the room.";

export const PAYMENT_RECOVERY_SUBTITLE =
  'Update your payment method to continue. The show waits until payment clears before the next auction or buy now.';
