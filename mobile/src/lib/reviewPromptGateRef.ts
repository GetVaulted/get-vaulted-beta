import { createRef } from 'react';

/** Where the "Enjoying Get Vaulted?" gate was triggered from — informational only today, but kept
 * distinct per call site in case some reasons ever need different copy or throttling later. */
export type ReviewPromptReason = 'marketplace_checkout_paid' | 'vault_review_submitted';

export type ReviewPromptGateHandle = {
  show: (reason: ReviewPromptReason) => void;
};

/** Imperative handle to the single <ReviewPromptGate /> mounted near the navigator root — mirrors
 * rootNavigationRef's pattern so call sites (checkout, write-review) can trigger it with a
 * fire-and-forget call instead of prop-drilling a modal all the way down. */
export const reviewPromptGateRef = createRef<ReviewPromptGateHandle>();

export function maybeShowReviewPrompt(reason: ReviewPromptReason): void {
  reviewPromptGateRef.current?.show(reason);
}
