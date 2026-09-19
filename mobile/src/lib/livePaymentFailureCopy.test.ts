import { describe, expect, it } from 'vitest';
import {
  isShippingAddressRecoveryFailure,
  mapLivePaymentFailureMessage,
  recoveryStatusMessage,
} from './livePaymentFailureCopy';

const ORDER_EXPIRED_COPY =
  "This purchase's payment window expired. Please try again or contact support.";

describe('mapLivePaymentFailureMessage', () => {
  it('maps stripe decline codes', () => {
    expect(mapLivePaymentFailureMessage(null, 'card_declined')).toBe('Your card was declined.');
    expect(mapLivePaymentFailureMessage(null, 'insufficient_funds')).toBe('Insufficient funds.');
    expect(mapLivePaymentFailureMessage(null, 'expired_card')).toBe('Your card has expired.');
  });

  it('maps order payment expired to the window copy, not card-expired', () => {
    expect(mapLivePaymentFailureMessage(null, 'ORDER_PAYMENT_EXPIRED')).toBe(ORDER_EXPIRED_COPY);
    // The server's humanized reason string must not fall through to "Your card has expired.".
    expect(mapLivePaymentFailureMessage('order payment expired')).toBe(ORDER_EXPIRED_COPY);
    expect(mapLivePaymentFailureMessage('order payment expired', 'ORDER_PAYMENT_EXPIRED')).toBe(
      ORDER_EXPIRED_COPY,
    );
  });

  it('maps client request timeouts to a safe retry message', () => {
    expect(mapLivePaymentFailureMessage('Request timed out after 15000ms: https://shopgetvaulted.com/api/...')).toMatch(
      /taking too long/i,
    );
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

describe('isShippingAddressRecoveryFailure', () => {
  it('detects missing delivery address, not generic fulfillment failures', () => {
    expect(isShippingAddressRecoveryFailure(null, 'FULFILLMENT_ORDER_FAILED')).toBe(false);
    expect(isShippingAddressRecoveryFailure(null, 'NO_SHIPPING_ADDRESS')).toBe(true);
    expect(
      isShippingAddressRecoveryFailure(
        'Add a delivery address to your Wallet (where items ship after the show).',
      ),
    ).toBe(true);
    expect(
      isShippingAddressRecoveryFailure(
        'Add a complete shipping address (street, city, state, ZIP) to your Wallet before buying.',
      ),
    ).toBe(true);
  });

  it('does not treat card declines as shipping recovery', () => {
    expect(isShippingAddressRecoveryFailure('Your card was declined.')).toBe(false);
    expect(isShippingAddressRecoveryFailure(null, 'card_declined')).toBe(false);
  });
});

describe('recoveryStatusMessage', () => {
  it('defers to the body reason for 402 (payment attempt failed)', () => {
    expect(recoveryStatusMessage(402)).toBeNull();
  });

  it('handles auth, validation, and server statuses', () => {
    expect(recoveryStatusMessage(401)).toMatch(/session expired/i);
    expect(recoveryStatusMessage(403)).toMatch(/session expired/i);
    expect(recoveryStatusMessage(400)).toMatch(/payment method/i);
    expect(recoveryStatusMessage(500)).toMatch(/retry failed/i);
    expect(recoveryStatusMessage(undefined)).toBeNull();
  });
});
