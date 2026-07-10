import { describe, expect, it } from 'vitest';
import type { WebStoredListing } from '../api/webListingsRepository';
import {
  defaultInventoryBucketForChannel,
  resolveListingInventoryChannel,
} from './sellerInventoryBuckets';

function row(partial: Partial<WebStoredListing>): WebStoredListing {
  return {
    id: 'x',
    title: 'Lot',
    status: 'draft',
    buyingFormat: 'buy_now',
    price: 1,
    ...partial,
  } as WebStoredListing;
}

describe('resolveListingInventoryChannel', () => {
  it('honors explicit inventoryChannel', () => {
    expect(resolveListingInventoryChannel(row({ inventoryChannel: 'live_show', status: 'active' }))).toBe(
      'live_show',
    );
    expect(
      resolveListingInventoryChannel(row({ inventoryChannel: 'marketplace', buyingFormat: 'auction' })),
    ).toBe('marketplace');
  });

  it('keeps auction lots without marketplace flags in live show', () => {
    expect(
      resolveListingInventoryChannel(
        row({ status: 'draft', buyingFormat: 'auction', allowOffers: false, allowLayaway: false }),
      ),
    ).toBe('live_show');
    expect(
      resolveListingInventoryChannel(
        row({ status: 'active', buyingFormat: 'auction', allowOffers: false, allowLayaway: false }),
      ),
    ).toBe('live_show');
    expect(
      resolveListingInventoryChannel(
        row({ status: 'sold', buyingFormat: 'auction', allowOffers: false, allowLayaway: false }),
      ),
    ).toBe('live_show');
  });

  it('keeps buy-now / offer marketplace rows in marketplace', () => {
    expect(
      resolveListingInventoryChannel(row({ status: 'active', buyingFormat: 'buy_now' })),
    ).toBe('marketplace');
    expect(
      resolveListingInventoryChannel(
        row({ status: 'draft', buyingFormat: 'buy_now', allowOffers: true }),
      ),
    ).toBe('marketplace');
  });
});

describe('defaultInventoryBucketForChannel', () => {
  it('opens drafts for live show and active for marketplace', () => {
    expect(defaultInventoryBucketForChannel('live_show')).toBe('drafts');
    expect(defaultInventoryBucketForChannel('marketplace')).toBe('active');
  });
});
