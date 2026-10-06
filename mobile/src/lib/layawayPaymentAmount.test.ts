import { describe, expect, it } from 'vitest';
import { parseLayawayPaymentAmount } from './layawayPaymentAmount';

describe('parseLayawayPaymentAmount', () => {
  it('accepts plain, dollar-sign and comma-formatted amounts', () => {
    expect(parseLayawayPaymentAmount('125', 600)).toEqual({ ok: true, amountUsd: 125 });
    expect(parseLayawayPaymentAmount('$1,250.50', 2000)).toEqual({ ok: true, amountUsd: 1250.5 });
    expect(parseLayawayPaymentAmount(' 99.9 ', 600)).toEqual({ ok: true, amountUsd: 99.9 });
  });

  it('accepts paying exactly the remaining balance', () => {
    expect(parseLayawayPaymentAmount('450', 450)).toEqual({ ok: true, amountUsd: 450 });
  });

  it('rejects empty, zero and non-numeric input', () => {
    expect(parseLayawayPaymentAmount('', 450).ok).toBe(false);
    expect(parseLayawayPaymentAmount('0', 450).ok).toBe(false);
    expect(parseLayawayPaymentAmount('abc', 450).ok).toBe(false);
    expect(parseLayawayPaymentAmount('-5', 450).ok).toBe(false);
    expect(parseLayawayPaymentAmount('1.234', 450).ok).toBe(false);
  });

  it('rejects more than the remaining balance with a clear message', () => {
    const r = parseLayawayPaymentAmount('500', 450);
    expect(r).toEqual({ ok: false, error: 'That is more than your remaining balance of $450.00.' });
  });
});
