import { describe, expect, it } from 'vitest';
import {
  HOST_CANCEL_GRACE_MS,
  hostCancelWaitSeconds,
  isBankVerificationFailure,
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

describe('isBankVerificationFailure', () => {
  it('detects the bank-verification reason and codes', () => {
    expect(isBankVerificationFailure('Your bank requires additional verification.')).toBe(true);
    expect(isBankVerificationFailure(null, 'authentication_required')).toBe(true);
    expect(isBankVerificationFailure(null, 'card_declined_authentication_required')).toBe(true);
  });

  it('does not treat declines or shipping problems as verification', () => {
    expect(isBankVerificationFailure('Your card was declined.')).toBe(false);
    expect(isBankVerificationFailure('Insufficient funds.')).toBe(false);
    expect(isBankVerificationFailure('Phone verification is required for this purchase.')).toBe(false);
    expect(isBankVerificationFailure('Add a delivery address to your Wallet.')).toBe(false);
    expect(isBankVerificationFailure(null, null)).toBe(false);
  });
});

describe('hostCancelWaitSeconds', () => {
  const failedAt = '2026-11-22T20:18:04.000Z';
  const t0 = Date.parse(failedAt);
  const verification = { failureReason: 'Your bank requires additional verification.', failedAt };

  it('makes the host wait the full grace right after a verification failure', () => {
    expect(hostCancelWaitSeconds(verification, t0)).toBe(HOST_CANCEL_GRACE_MS / 1000);
  });

  it('counts down and then allows cancelling', () => {
    expect(hostCancelWaitSeconds(verification, t0 + 12_000)).toBe(78);
    expect(hostCancelWaitSeconds(verification, t0 + HOST_CANCEL_GRACE_MS)).toBe(0);
    expect(hostCancelWaitSeconds(verification, t0 + HOST_CANCEL_GRACE_MS + 5_000)).toBe(0);
  });

  it('never delays cancelling an ordinary decline', () => {
    expect(hostCancelWaitSeconds({ failureReason: 'Your card was declined.', failedAt }, t0)).toBe(0);
    expect(hostCancelWaitSeconds({ failureReason: null, failedAt }, t0)).toBe(0);
  });

  it('fails open when the timestamp cannot be read', () => {
    expect(hostCancelWaitSeconds({ ...verification, failedAt: 'not a date' }, t0)).toBe(0);
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
