import { describe, expect, it } from 'vitest';
import {
  additionalLabelSuccessFeedback,
  bundledLabelSuccessFeedback,
  formatBundledLabelError,
} from './bundledLabelMessages';

describe('formatBundledLabelError', () => {
  it('turns server codes into plain instructions', () => {
    expect(formatBundledLabelError('x', 'SELLER_SHIP_FROM_INCOMPLETE')).toMatch(/ship-from address/);
    expect(formatBundledLabelError('x', 'SELLER_CONTACT_INCOMPLETE')).toMatch(/contact phone/);
    expect(formatBundledLabelError('x', 'BUYER_CONTACT_INCOMPLETE')).toMatch(/buyer/i);
    expect(formatBundledLabelError('x', 'NO_ELIGIBLE_ORDERS')).toMatch(/No paid, unlabeled orders/);
    expect(formatBundledLabelError('x', 'NOT_A_COMBINED_BUNDLE_SESSION')).toMatch(/ship-alone/);
    expect(formatBundledLabelError('x', 'SHIPPO_NOT_CONFIGURED')).toMatch(/temporarily unavailable/);
  });
  it('explains missing rates and falls back to the server text', () => {
    expect(formatBundledLabelError('No Shippo rates returned', undefined)).toMatch(/No USPS\/UPS rates/);
    expect(formatBundledLabelError('Something specific', undefined)).toBe('Something specific');
    expect(formatBundledLabelError(undefined, undefined)).toBe('Bundled label creation failed.');
  });
});

describe('bundledLabelSuccessFeedback', () => {
  it('prefers the server warning', () => {
    expect(bundledLabelSuccessFeedback({ warning: 'careful', labelUrl: 'u' })).toEqual({
      tone: 'warning',
      message: 'careful',
    });
  });
  it('says so when the label already existed', () => {
    expect(bundledLabelSuccessFeedback({ alreadyExisted: true, labelUrl: 'u' }).message).toMatch(/already exists/);
  });
  it('confirms creation, or notes a missing PDF', () => {
    expect(bundledLabelSuccessFeedback({ labelUrl: 'u' }).message).toMatch(/created/);
    expect(bundledLabelSuccessFeedback({ labelUrl: null }).message).toMatch(/purchase recorded/);
  });
});

describe('extra bundle labels', () => {
  it('explains the extra-label refusals', () => {
    expect(formatBundledLabelError('x', 'ALL_LABELS_BOUGHT')).toMatch(/every order/);
    expect(formatBundledLabelError('x', 'ADDITIONAL_LABELS_UNAVAILABLE')).toMatch(/more than one Surprise Set spin/);
    expect(formatBundledLabelError('x', 'NO_PRIMARY_LABEL_YET')).toMatch(/first label/);
  });
  it('confirms an extra label with the running count', () => {
    expect(
      additionalLabelSuccessFeedback({ labelUrl: 'u', packagesBought: 2, maxPackages: 9 }).message,
    ).toMatch(/\(2 of 9 bought\)/);
    expect(additionalLabelSuccessFeedback({ warning: 'charge failed', labelUrl: 'u', packagesBought: 2, maxPackages: 9 })).toEqual({
      tone: 'warning',
      message: 'charge failed',
    });
  });
});
