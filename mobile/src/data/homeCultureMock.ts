import { marketplaceDemoProducts, marketplaceRecentSales } from './marketplaceFeedMock';
import type { FeaturedCreator, Product } from '../types';

/** Demo culture rails when API feeds are thin — feels alive, not placeholder dashes. */
export const homeTrendingCreators: FeaturedCreator[] = [
  {
    host: {
      id: 'seller-1',
      name: 'Nocturne Vault',
      handle: '@nocturne_vault',
      verified: true,
      followers: '48k',
      avatarUrl: 'https://i.pravatar.cc/120?u=nocturne_vault',
    },
    specialty: 'Sports cards · live auctions',
    status: 'live',
    statusLabel: 'Live now',
  },
  {
    host: {
      id: 'seller-2',
      name: 'Wax Works',
      handle: '@wax_works',
      verified: true,
      followers: '31k',
      avatarUrl: 'https://i.pravatar.cc/120?u=wax_works',
    },
    specialty: 'Sealed · premium inventory',
    status: 'live',
    statusLabel: '42 in room',
  },
  {
    host: {
      id: 'seller-3',
      name: 'Grail Lane',
      handle: '@grail_lane',
      verified: true,
      followers: '22k',
      avatarUrl: 'https://i.pravatar.cc/120?u=grail_lane',
    },
    specialty: 'Slabs · chase cards',
    status: 'scheduled',
    statusLabel: 'Tonight 8pm',
  },
  {
    host: {
      id: 'seller-4',
      name: 'Vault Kings',
      handle: '@vault_kings',
      verified: true,
      followers: '19k',
      avatarUrl: 'https://i.pravatar.cc/120?u=vault_kings',
    },
    specialty: 'Memorabilia · authenticated',
    status: 'off',
    statusLabel: 'Big sale yesterday',
  },
  {
    host: {
      id: 'seller-5',
      name: 'Chase City',
      handle: '@chase_city',
      verified: false,
      followers: '14k',
      avatarUrl: 'https://i.pravatar.cc/120?u=chase_city',
    },
    specialty: 'Sneakers · live drops',
    status: 'live',
    statusLabel: 'Filling fast',
  },
];

export const homeRecentSales = marketplaceRecentSales;

export const homeFeaturedDrops: Product[] = marketplaceDemoProducts.slice(0, 10);

export const homeLiveActivity = [
  { id: 'a1', text: 'PSA 10 just sold in Nocturne Vault', time: '1m' },
  { id: 'a2', text: '42 collectors in Wax Works', time: '3m' },
  { id: 'a3', text: 'Jordan 4 lane heating up', time: '6m' },
  { id: 'a4', text: 'New grail listed in The Vault', time: '9m' },
] as const;
