import { describe, expect, it } from 'vitest';
import { sellerLayawayStatusLabel } from './sellerLayawayDisplay';

describe('sellerLayawayStatusLabel', () => {
  it('maps known layaway display statuses', () => {
    expect(sellerLayawayStatusLabel('active')).toBe('Active');
    expect(sellerLayawayStatusLabel('overdue')).toBe('Overdue');
    expect(sellerLayawayStatusLabel('completed')).toBe('Ready to ship');
    expect(sellerLayawayStatusLabel('defaulted')).toBe('Defaulted');
  });
});
