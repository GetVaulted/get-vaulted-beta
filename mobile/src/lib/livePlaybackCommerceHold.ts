/**
 * While Stripe PaymentSheet / confirmPayment / 3DS is open, Android reports
 * AppState `background` (another Activity). That must NOT run the buyer Stage
 * leave + latch path used for a real home swipe — otherwise buying an item
 * kills the live feed until force-close.
 */
let commerceHoldDepth = 0;

export function beginLivePlaybackCommerceHold(): void {
  commerceHoldDepth += 1;
}

export function endLivePlaybackCommerceHold(): void {
  commerceHoldDepth = Math.max(0, commerceHoldDepth - 1);
}

export function isLivePlaybackCommerceHoldActive(): boolean {
  return commerceHoldDepth > 0;
}

/** Test-only reset. */
export function resetLivePlaybackCommerceHoldForTests(): void {
  commerceHoldDepth = 0;
}

/** Run `fn` with Stage suspend/leave suppressed for Stripe native UI. */
export async function withLivePlaybackCommerceHold<T>(fn: () => Promise<T>): Promise<T> {
  beginLivePlaybackCommerceHold();
  try {
    return await fn();
  } finally {
    endLivePlaybackCommerceHold();
  }
}
