import { describe, expect, it } from 'vitest';
import { mapLivePaymentFailureMessage } from './livePaymentFailureCopy';

describe('mapLivePaymentFailureMessage', () => {
  it('maps stripe decline codes', () => {
    expect(mapLivePaymentFailureMessage(null, 'card_declined')).toBe('Your card was declined.');
    expect(mapLivePaymentFailureMessage(null, 'insufficient_funds')).toBe('Insufficient funds.');
    expect(mapLivePaymentFailureMessage(null, 'expired_card')).toBe('Your card has expired.');
  });

  it('never surfaces raw stripe errors', () => {
    expect(mapLivePaymentFailureMessage('Stripe: No such payment_intent: pi_123')).toBe(
      'Your payment method needs attention.',
    );
  });

  it('uses fallback for empty input', () => {
    expect(mapLivePaymentFailureMessage()).toBe('Your payment method needs attention.');
  });
});
