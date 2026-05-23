import type { CategoryId, Product } from '../types';

export type GallerySlide = {
  id: string;
  uri: string;
  caption: string;
  kind: 'hero' | 'macro' | 'detail' | 'video';
};

export type ListingViewModel = {
  gallery: GallerySlide[];
  authProvider: string;
  inspectionLine: string;
  activity: {
    watching: number;
    offersPending: number;
    vaultSaves: number;
    recentlyViewedLabel: string;
    priceUpdatedLabel?: string;
    sellerLive: boolean;
    featuredInLive?: string;
  };
  trade: {
    allowOffers: boolean;
    acceptsTrades: boolean;
    tradeEligible: boolean;
    lookingFor: string[];
  };
  pricing: {
    buyNow: string;
    marketReference?: string;
    paymentNote: string;
    feeTransparency: string;
    deliveryEstimate: string;
  };
  specs: { label: string; value: string }[];
  sellerShowroom: {
    specialties: string[];
    topCategories: string[];
    liveSchedule: string;
    vaultScore: string;
    completionRate: string;
    salesCount: string;
    tradesCount: string;
    responseTime: string;
    shippingSpeed: string;
    ratingLabel: string;
    provenance?: string;
    recentListingIds: string[];
  };
  content: {
    acquisitionTag: string;
    sellerNotes: string;
    conditionNotes: string;
    authDetails: string;
    shippingProtection: string;
    collectorInterest: string;
    featuredLiveTitle: string;
    featuredLiveSubtitle: string;
  };
  similarProductIds: string[];
  recentlySold: { title: string; price: string; when: string }[];
};

function galleryForProduct(p: Product): GallerySlide[] {
  const base = p.imageUrl ?? 'https://images.unsplash.com/photo-1523170335258-f5ed11844a49?w=1200';
  const sep = base.includes('?') ? '&' : '?';
  const slides: GallerySlide[] = [
    { id: 'g0', uri: base, caption: 'Gallery hero', kind: 'hero' },
    {
      id: 'g1',
      uri: `${base}${sep}auto=format&fit=crop&w=1400&h=1400`,
      caption:
        p.category === 'watches'
          ? 'Macro · clasp & crown'
          : p.category === 'cards'
            ? 'Macro · slab corners & surface'
            : 'Macro · materials & stitching',
      kind: 'macro',
    },
    {
      id: 'g2',
      uri: `${base}${sep}auto=format&fit=crop&w=1400&h=900`,
      caption:
        p.category === 'watches'
          ? 'Movement / caseback detail'
          : p.category === 'sneakers'
            ? 'Outsole & factory stitch'
            : 'Autograph / print detail',
      kind: 'detail',
    },
    {
      id: 'g3',
      uri: base,
      caption: 'Video tour · vault capture',
      kind: 'video',
    },
  ];
  return slides;
}

function specsNeutral(p: Product): { label: string; value: string }[] {
  return [
    { label: 'Category', value: p.category },
    { label: 'Condition', value: p.conditionGrade ?? 'See listing photos and seller notes' },
    { label: 'Verification', value: p.vaultVerified ? 'Vault verified lane' : 'Seller-provided documentation' },
    {
      label: 'Description',
      value: (p.storyline ?? p.title).slice(0, 140) || 'Details available in the listing.',
    },
  ];
}

function neutralLookingFor(category: CategoryId): string[] {
  switch (category) {
    case 'cards':
      return ['Graded slabs in the same era', 'Sealed wax or hobby boxes at fair value', 'Cash + partial trade structures'];
    case 'watches':
      return ['Like-kind references with clear papers', 'Sport models in strong condition', 'Straight purchase or trade-up'];
    case 'sneakers':
      return ['Deadstock pairs in adjacent sizes', 'Archive runners with OG accessories', 'Cash offers aligned to recent comps'];
    case 'memorabilia':
      return ['Signed pieces with solid provenance', 'Game-used or photo-matched items', 'Display-ready framing packages'];
    case 'other':
      return [
        'Electronics with clear condition notes',
        'Collectibles with honest provenance',
        'Cash or trade for mixed inventory',
      ];
    default:
      return ['Collectibles in this lane at fair market value', 'Cash or structured trade offers', 'Vault-protected settlement'];
  }
}

export function enrichListing(product: Product): ListingViewModel {
  const watching = 0;
  const offers = 0;
  const saves = 0;

  const specialties =
    product.category === 'cards'
      ? ['Sports cards', 'Slabs & raw', 'Break-friendly inventory']
      : product.category === 'sneakers'
        ? ['Sneakers', 'Deadstock & lightly worn', 'Size-specific trades']
        : product.category === 'watches'
          ? ['Watches', 'Sport & everyday references', 'Paper trail when disclosed']
          : product.category === 'memorabilia'
            ? ['Signed collectibles', 'Game-used', 'Display pieces']
            : ['Authenticated collectibles', 'Hobby inventory', 'Live-ready lots'];

  const topCategories: CategoryId[] =
    product.category === 'cards'
      ? ['cards', 'memorabilia', 'other']
      : product.category === 'sneakers'
        ? ['sneakers', 'cards', 'watches']
        : product.category === 'watches'
          ? ['watches', 'cards', 'luxury']
          : ['memorabilia', 'cards', 'sneakers'];

  return {
    gallery: galleryForProduct(product),
    authProvider: product.vaultVerified ? 'Vaulted Inspection + partner lab' : 'Seller-submitted documentation',
    inspectionLine: product.vaultVerified ? 'Verified by Vaulted Inspection' : 'Standard seller verification',
    activity: {
      watching,
      offersPending: offers,
      vaultSaves: saves,
      recentlyViewedLabel: 'Quiet until the first collectors land on this page',
      priceUpdatedLabel: undefined,
      sellerLive: false,
      featuredInLive: undefined,
    },
    trade: {
      allowOffers: product.allowOffers === true,
      acceptsTrades: product.acceptTradeOffers === true,
      tradeEligible: product.acceptTradeOffers === true && product.vaultVerified,
      lookingFor: neutralLookingFor(product.category),
    },
    pricing: {
      buyNow: product.buyNow ?? product.listingPrice,
      marketReference:
        product.category === 'watches' || product.category === 'cards'
          ? 'Comparable sales (90d) · private market index'
          : undefined,
      paymentNote: 'Affirm / card / wire above $10k where eligible',
      feeTransparency: 'Vaulted Protected Checkout — all-in buyer clarity at pay step',
      deliveryEstimate: '2–4 days · insured · signature required over $5k',
    },
    specs: specsNeutral(product),
    sellerShowroom: {
      specialties,
      topCategories: topCategories.map((c) => c.charAt(0).toUpperCase() + c.slice(1)),
      liveSchedule: 'Follow the seller — live schedule publishes here when they go on air.',
      vaultScore: 'Building as sales complete on-platform',
      completionRate: 'Tracked after checkout milestones',
      salesCount: 'Seller history unlocks with completed orders',
      tradesCount: 'Trade count grows with protected trades',
      responseTime: 'Typical reply time appears after first conversations',
      shippingSpeed: 'Ship timeline confirmed at checkout',
      ratingLabel: 'Ratings aggregate from verified buyers',
      provenance: product.storyline ? `Provenance: ${product.storyline}` : undefined,
      recentListingIds: [],
    },
    content: {
      acquisitionTag: 'Private acquisition listing',
      sellerNotes:
        'Seller notes appear here from the listing description. Message the seller for additional photos or documentation.',
      conditionNotes:
        'Review listing imagery and stated condition. Request macro shots through secure messaging before you offer.',
      authDetails:
        product.vaultVerified
          ? 'Dual-line verification: in-hand Vaulted Inspection with photographic chain of custody, plus serial / slab registry checks where applicable.'
          : 'Documentation package available after offer acceptance — see messaging for NDA-sensitive serial imagery.',
      shippingProtection:
        'Insured outbound with signature thresholds, optional concierge hold at Vaulted hub, and dispute-first support if anything deviates from listing.',
      collectorInterest: 'Interest signals appear as collectors watch, save, and message on this listing.',
      featuredLiveTitle: 'Live appearances',
      featuredLiveSubtitle: 'When this seller goes live, pinned lots and break lanes will surface here.',
    },
    similarProductIds: [],
    recentlySold: [],
  };
}
