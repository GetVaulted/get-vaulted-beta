/**
 * Server-side idempotency key for live spot / Surprise Set purchases.
 *
 * Clients build the header from the variant id plus a 30-second time bucket, so two different buyers
 * tapping the same spot in the same 30 seconds send the SAME header. The stored key is unique across
 * all buyers, so the second buyer's purchase hit a unique-constraint error (HTTP 500) every time —
 * during a fast Surprise Set run one buyer could be locked out for the whole show. Prefixing the
 * buyer id keeps retries idempotent for that buyer while never colliding with anyone else.
 */
export function scopedLivePurchaseIdempotencyKey(buyerId: string, header: string | null | undefined): string | null {
  const raw = header?.trim();
  if (!raw) return null;
  return `${buyerId}:${raw}`.slice(0, 160);
}
