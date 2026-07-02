import { describe, expect, it } from 'vitest';
import { queueSaleTypePillLabel } from './liveQueueSaleTypePill';

describe('queueSaleTypePillLabel', () => {
  it('maps plain auction and buy now lots', () => {
    expect(queueSaleTypePillLabel({ salesFormat: 'auction' })).toBe('Auction');
    expect(queueSaleTypePillLabel({ salesFormat: 'buy_now' })).toBe('Buy Now');
  });

  it('maps PYT/PYD claim vs spot auction mode', () => {
    expect(queueSaleTypePillLabel({ salesFormat: 'team_break', activeSpotCommerceMode: null })).toBe('Buy Now');
    expect(queueSaleTypePillLabel({ salesFormat: 'variant_selection', activeSpotCommerceMode: 'fixed' })).toBe(
      'Buy Now',
    );
    expect(queueSaleTypePillLabel({ salesFormat: 'team_break', activeSpotCommerceMode: 'auction' })).toBe('Auction');
  });
});
