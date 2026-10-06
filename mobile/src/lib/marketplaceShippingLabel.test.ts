import { describe, expect, it } from 'vitest';
import { marketplaceShippingLabel } from './marketplaceShippingLabel';

describe('marketplaceShippingLabel', () => {
  it('never claims free shipping for a stored price of 0 — it shows nothing', () => {
    expect(marketplaceShippingLabel(0)).toBeNull();
  });

  it('shows nothing for missing or invalid prices', () => {
    expect(marketplaceShippingLabel(undefined)).toBeNull();
    expect(marketplaceShippingLabel(null)).toBeNull();
    expect(marketplaceShippingLabel(Number.NaN)).toBeNull();
    expect(marketplaceShippingLabel(-3)).toBeNull();
  });

  it('shows a positive flat price', () => {
    expect(marketplaceShippingLabel(5)).toBe('+$5 shipping');
    expect(marketplaceShippingLabel(7.5)).toBe('+$7.50 shipping');
  });
});
