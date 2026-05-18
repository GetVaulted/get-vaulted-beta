/** Culture / momentum rails until trade activity APIs expand. */
export type TradeMomentumItem = {
  id: string;
  handle: string;
  avatarUrl: string;
  verified: boolean;
  headline: string;
  value: string;
  status: string;
  completionPct?: string;
};

export const tradeRecentDeals: TradeMomentumItem[] = [
  {
    id: 'm1',
    handle: '@vault_kings',
    avatarUrl: 'https://i.pravatar.cc/80?u=vault_kings',
    verified: true,
    headline: 'PSA 10 ↔ Jordan 4 swap',
    value: '$2.4k',
    status: 'Completed',
    completionPct: '98% trades',
  },
  {
    id: 'm2',
    handle: '@grail_lane',
    avatarUrl: 'https://i.pravatar.cc/80?u=grail_lane',
    verified: true,
    headline: 'Rolex + cash adjustment',
    value: '$18k',
    status: 'Shipped',
    completionPct: '100% trades',
  },
  {
    id: 'm3',
    handle: '@chase_city',
    avatarUrl: 'https://i.pravatar.cc/80?u=chase_city',
    verified: false,
    headline: 'Sealed hobby box trade',
    value: '$640',
    status: 'Completed',
    completionPct: '94% trades',
  },
];

export const tradeNegotiationPulse = [
  { id: 'n1', text: '@nocturne_vault countered an offer', time: '4m' },
  { id: 'n2', text: 'New offer on a PSA 10 Wembanyama', time: '12m' },
  { id: 'n3', text: '@wax_works accepted a vault trade', time: '28m' },
] as const;
