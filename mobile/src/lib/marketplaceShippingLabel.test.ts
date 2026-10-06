import { describe, expect, it } from 'vitest';
import { marketplaceShippingLabel } from './marketplaceShippingLabel';

describe('marketplaceShippingLabel', () => {
  it('never claims free shipping for a stored price of 0', () => {
    expect(marketplaceShippingLabel(0)).toBe('Shipping at checkout');
    expect(marketplaceShippingLabel(0).toLowerCase()).not.toContain('free');
  });

  it('treats missing or invalid prices as calculated at checkout', () => {
    expect(marketplaceShippingLabel(undefined)).toBe('Shipping at checkout');
    expect(marketplaceShippingLabel(null)).toBe('Shipping at checkout');
    expect(marketplaceShippingLabel(Number.NaN)).toBe('Shipping at checkout');
    expect(marketplaceShippingLabel(-3)).toBe('Shipping at checkout');
  });

  it('shows a positive flat price', () => {
    expect(marketplaceShippingLabel(5)).toBe('+$5 shipping');
    expect(marketplaceShippingLabel(7.5)).toBe('+$7.50 shipping');
  });
});
