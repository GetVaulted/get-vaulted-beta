import type { CategoryId, Host, Product, SaleActivity } from '../types';

export const MARKETPLACE_DEMO_PREFIX = 'marketplace-demo-';

export function isMarketplaceDemoProduct(id: string): boolean {
  return id.startsWith(MARKETPLACE_DEMO_PREFIX);
}

const host = (id: string, name: string, handle: string, verified = true): Host => ({
  id,
  name,
  handle,
  verified,
  followers: `${(12 + id.length * 3) % 89}k`,
  avatarUrl: `https://i.pravatar.cc/120?u=${encodeURIComponent(handle)}`,
});

const PHOTOS = [
  '1611532736597-de2d4265fba3',
  '1542291026-7eec264c27ff',
  '1574623453961-0d3c2df93725',
  '1606107550911-3d12176c3d93',
  '158491786544-2fe78d556e8d',
  '1524592094714-0f0654e20314',
] as const;

const img = (i: number) =>
  `https://images.unsplash.com/photo-${PHOTOS[i % PHOTOS.length]}?w=640&q=85&auto=format&fit=crop`;

export const marketplaceMomentumDemo = {
  soldToday: '847',
  activeListings: '12.4k',
  endingSoon: '38',
} as const;

export type MarketplaceHeroSlide = {
  id: string;
  kicker: string;
  title: string;
  cta: string;
  imageUrl: string;
  accent: [string, string];
};

export const marketplaceHeroSlides: MarketplaceHeroSlide[] = [
  {
    id: 'premium',
    kicker: 'The Vault',
    title: 'Chase premium inventory',
    cta: 'Featured listings',
    imageUrl: img(0),
    accent: ['#1a1208', '#0a0a0c'],
  },
  {
    id: 'categories',
    kicker: 'Browse by lane',
    title: 'Cards, sneakers, watches, memorabilia',
    cta: 'Shop categories',
    imageUrl: img(1),
    accent: ['#081218', '#0a0a0c'],
  },
  {
    id: 'verified',
    kicker: 'Authenticated',
    title: 'Buy verified grails across the vault',
    cta: 'Vault verified',
    imageUrl: img(4),
    accent: ['#12081a', '#0a0a0c'],
  },
];

export const marketplaceDemoProducts: Product[] = [
  {
    id: `${MARKETPLACE_DEMO_PREFIX}1`,
    title: '2018 Prizm Luka Dončić RC PSA 10',
    category: 'cards',
    imageUrl: img(0),
    imageGradient: ['#0c1018', '#1a2030'],
    vaultVerified: true,
    listingPrice: '$4,250',
    conditionGrade: 'PSA 10 · Pop 412',
    seller: host('s1', 'Nocturne Vault', '@nocturne_vault'),
    auctionEnds: '2h 14m',
    storyline: 'Most watched',
  },
  {
    id: `${MARKETPLACE_DEMO_PREFIX}2`,
    title: 'Jordan 1 Chicago Lost & Found',
    category: 'sneakers',
    imageUrl: img(1),
    imageGradient: ['#180808', '#0c0c10'],
    vaultVerified: true,
    listingPrice: '$385',
    conditionGrade: 'DS · Size 10.5',
    seller: host('s2', 'Sole Vault', '@solevault'),
    storyline: 'New arrival',
  },
  {
    id: `${MARKETPLACE_DEMO_PREFIX}3`,
    title: 'Rolex Submariner Date 126610LN',
    category: 'watches',
    imageUrl: img(5),
    imageGradient: ['#0a0c10', '#141820'],
    vaultVerified: true,
    listingPrice: '$12,800',
    conditionGrade: 'Full set · 2022',
    seller: host('s3', 'Chrono Lane', '@chrono_lane'),
    auctionEnds: '45m',
  },
  {
    id: `${MARKETPLACE_DEMO_PREFIX}4`,
    title: 'Signed Jordan Finals Jersey',
    category: 'memorabilia',
    imageUrl: img(2),
    imageGradient: ['#101018', '#1c1428'],
    vaultVerified: false,
    listingPrice: '$2,100',
    conditionGrade: 'JSA · Display ready',
    seller: host('s4', 'Legends Vault', '@legends_vault'),
    featuredInLive: 'Also featured live',
  },
  {
    id: `${MARKETPLACE_DEMO_PREFIX}5`,
    title: 'Charizard 1st Ed Base PSA 9',
    category: 'cards',
    imageUrl: img(3),
    imageGradient: ['#1a1408', '#0c0c08'],
    vaultVerified: true,
    listingPrice: '$18,500',
    conditionGrade: 'PSA 9',
    seller: host('s5', 'Slab Syndicate', '@slab_syndicate'),
    auctionEnds: '12m',
    storyline: 'Trending marketplace',
  },
  {
    id: `${MARKETPLACE_DEMO_PREFIX}6`,
    title: 'Travis Scott Reverse Mocha',
    category: 'sneakers',
    imageUrl: img(1),
    imageGradient: ['#140c08', '#0a0a0a'],
    vaultVerified: true,
    listingPrice: '$1,240',
    conditionGrade: 'OG all · 9.5/10',
    seller: host('s6', 'Heat Check Kicks', '@heatcheck'),
    storyline: 'Trending +18%',
  },
  {
    id: `${MARKETPLACE_DEMO_PREFIX}7`,
    title: 'Omega Speedmaster Professional',
    category: 'watches',
    imageUrl: img(5),
    imageGradient: ['#0c0c10', '#181820'],
    vaultVerified: true,
    listingPrice: '$5,650',
    seller: host('s7', 'Timepiece ATL', '@timepiece_atl'),
  },
  {
    id: `${MARKETPLACE_DEMO_PREFIX}8`,
    title: 'Pikachu Illustrator Promo',
    category: 'cards',
    imageUrl: img(0),
    imageGradient: ['#181008', '#0a0a08'],
    vaultVerified: true,
    listingPrice: '$92,000',
    conditionGrade: 'CGC 8.5',
    seller: host('s8', 'Grail Index', '@grail_index'),
  },
  {
    id: `${MARKETPLACE_DEMO_PREFIX}9`,
    title: 'Off-White x Nike Dunk Lot',
    category: 'sneakers',
    imageUrl: img(1),
    imageGradient: ['#101018', '#0c0c14'],
    vaultVerified: false,
    listingPrice: '$890',
    seller: host('s9', 'Archive Drop', '@archive_drop'),
    buyNow: 'Buy now',
  },
  {
    id: `${MARKETPLACE_DEMO_PREFIX}10`,
    title: 'Kobe Game-Worn Warmup',
    category: 'memorabilia',
    imageUrl: img(2),
    imageGradient: ['#140818', '#0a0a0c'],
    vaultVerified: true,
    listingPrice: '$8,400',
    seller: host('s10', 'Mamba Archive', '@mamba_archive'),
  },
  {
    id: `${MARKETPLACE_DEMO_PREFIX}11`,
    title: 'Hermès Kelly 28 Gold',
    category: 'luxury',
    imageUrl: img(4),
    imageGradient: ['#181408', '#0c0c08'],
    vaultVerified: true,
    listingPrice: '$24,500',
    conditionGrade: 'Vault consignment',
    seller: host('s11', 'Maison Vault', '@maison_vault'),
  },
  {
    id: `${MARKETPLACE_DEMO_PREFIX}12`,
    title: 'PSA 10 Prizm Wembanyama',
    category: 'cards',
    imageUrl: img(3),
    imageGradient: ['#0c1018', '#1a1828'],
    vaultVerified: true,
    listingPrice: '$1,850',
    seller: host('s12', 'Rookie Radar', '@rookie_radar'),
    storyline: 'New arrival',
  },
  {
    id: `${MARKETPLACE_DEMO_PREFIX}13`,
    title: 'Graded rookie lot · 3 slabs',
    category: 'cards',
    imageUrl: img(0),
    imageGradient: ['#101420', '#0a0c10'],
    vaultVerified: false,
    listingPrice: '$340',
    seller: host('s13', 'Collector Lane', '@collector_lane'),
  },
  {
    id: `${MARKETPLACE_DEMO_PREFIX}14`,
    title: 'Sealed Prizm Basketball Hobby',
    category: 'cards',
    imageUrl: img(2),
    imageGradient: ['#0c1218', '#101828'],
    vaultVerified: true,
    listingPrice: '$425',
    seller: host('s14', 'Wax Vault', '@wax_vault'),
    buyNow: 'Buy now',
  },
  {
    id: `${MARKETPLACE_DEMO_PREFIX}15`,
    title: 'Audemars Piguet Royal Oak',
    category: 'watches',
    imageUrl: img(5),
    imageGradient: ['#0a0c10', '#141820'],
    vaultVerified: true,
    listingPrice: '$38,200',
    seller: host('s15', 'AP Vault', '@ap_vault'),
  },
  {
    id: `${MARKETPLACE_DEMO_PREFIX}16`,
    title: 'Collector bundle · graded trio',
    category: 'cards',
    imageUrl: img(3),
    imageGradient: ['#121018', '#0a0a0c'],
    vaultVerified: false,
    listingPrice: '$340',
    seller: host('s16', 'Lane Picks', '@lane_picks'),
  },
];

export const marketplaceRecentSales: SaleActivity[] = [
  { id: 'sale-1', item: 'PSA 10 Wembanyama', amount: '$1,820', channel: 'Marketplace', timeAgo: '2m', imageUrl: img(3), category: 'cards' },
  { id: 'sale-2', item: 'Jordan 4 Military', amount: '$285', channel: 'Buy now', timeAgo: '5m', imageUrl: img(1), category: 'sneakers' },
  { id: 'sale-3', item: 'Submariner 126610', amount: '$12,400', channel: 'Auction', timeAgo: '8m', category: 'watches' },
  { id: 'sale-4', item: 'Prizm hobby box', amount: '$410', channel: 'Marketplace', timeAgo: '11m', category: 'cards' },
  { id: 'sale-5', item: 'Signed Kobe photo', amount: '$940', channel: 'Vault verified', timeAgo: '14m', category: 'memorabilia' },
  { id: 'sale-6', item: 'Reverse Mocha 10.5', amount: '$1,195', channel: 'Buy now', timeAgo: '18m', category: 'sneakers' },
  { id: 'sale-7', item: 'Charizard PSA 9', amount: '$17,200', channel: 'Auction', timeAgo: '22m', category: 'cards' },
  { id: 'sale-8', item: 'AP Royal Oak', amount: '$37,800', channel: 'Luxury lane', timeAgo: '26m', category: 'watches' },
];
