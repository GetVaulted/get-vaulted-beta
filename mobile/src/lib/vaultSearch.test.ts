import { describe, expect, it } from 'vitest';
import { filterLiveStreamsByQuery, filterProductsByQuery } from './vaultSearch';
import type { LiveStream, Product } from '../types';

describe('vaultSearch', () => {
  it('filters listings by title and seller handle', () => {
    const products = [
      {
        id: '1',
        title: 'PSA 10 Charizard',
        category: 'cards',
        seller: { id: 's1', name: 'Vault King', handle: 'vaultking', avatarUrl: '', verified: true, followers: '1k' },
        listingPrice: '$500',
        imageGradient: ['#000', '#111'],
        vaultVerified: true,
      },
    ] as Product[];
    expect(filterProductsByQuery(products, 'charizard')).toHaveLength(1);
    expect(filterProductsByQuery(products, 'vaultking')).toHaveLength(1);
    expect(filterProductsByQuery(products, 'watches')).toHaveLength(0);
  });

  it('filters live streams by title and host handle', () => {
    const streams = [
      {
        id: 'room-1',
        title: 'Sunday Card Break',
        category: 'cards',
        viewers: 12,
        host: { id: 'h1', name: 'Host', handle: 'cardhost', avatarUrl: '', verified: true, followers: '2k' },
      },
    ] as LiveStream[];
    expect(filterLiveStreamsByQuery(streams, 'break')).toHaveLength(1);
    expect(filterLiveStreamsByQuery(streams, 'cardhost')).toHaveLength(1);
  });
});
