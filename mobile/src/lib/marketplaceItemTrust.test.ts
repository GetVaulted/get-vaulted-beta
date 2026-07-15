import { describe, expect, it } from 'vitest';
import { buildProductTrustMetrics } from './marketplaceItemTrust';
import type { Product } from '../types';

function baseProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'listing_1',
    title: 'Test card',
    category: 'cards',
    imageGradient: ['#000', '#111'],
    vaultVerified: false,
    listingPrice: '$10',
    seller: {
      id: 'seller_1',
      name: 'newseller',
      handle: '@newseller',
      avatarUrl: '',
      verified: false,
      followers: '—',
    },
    ...overrides,
  };
}

describe('buildProductTrustMetrics', () => {
  it('shows New completed sales when seller has no orders', () => {
    const metrics = buildProductTrustMetrics(baseProduct({ sellerCompletedOrderCount: 0 }));
    expect(metrics.completedSales).toBe('New');
    expect((metrics as Record<string, unknown>).responseTime).toBeUndefined();
    expect((metrics as Record<string, unknown>).shipPerformance).toBeUndefined();
  });

  it('shows New when order count is missing (browse cards)', () => {
    const metrics = buildProductTrustMetrics(baseProduct());
    expect(metrics.completedSales).toBe('New');
  });

  it('reports real completed sales when provided', () => {
    const metrics = buildProductTrustMetrics(baseProduct({ sellerCompletedOrderCount: 42 }));
    expect(metrics.completedSales).toBe('42');
  });

  it('does not mark Vault verified from vaultVerified flag alone without seller level', () => {
    const metrics = buildProductTrustMetrics(baseProduct({ vaultVerified: true, sellerLevel: 'vault_seller' }));
    expect(metrics.authenticationStatus).toBe('Ask seller');
  });

  it('marks Vault verified for real vault_verified seller level', () => {
    const metrics = buildProductTrustMetrics(
      baseProduct({ sellerLevel: 'vault_verified', sellerLevelLabel: 'Vault Verified' }),
    );
    expect(metrics.authenticationStatus).toBe('Vault verified');
  });
});
