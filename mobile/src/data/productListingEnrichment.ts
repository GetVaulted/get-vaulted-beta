import { buildListingGallerySlides, type GallerySlide } from '../lib/productListingGallery';
import { resolvePublicSellerLevelLabel } from '../lib/sellerLevelBadge';
import type { CategoryId, Product } from '../types';

export type { GallerySlide };

export type ListingViewModel = {
  gallery: GallerySlide[];
  sellerLevelBadge: string | null;
  showVaultVerifiedBadge: boolean;
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
    description: string | null;
    conditionNotes: string | null;
    authDetails: string | null;
    shippingProtection: string | null;
    collectorInterest: string | null;
  };
  liveAppearances: { id: string; title: string; subtitle?: string; occurredAtLabel?: string }[];
  similarProductIds: string[];
  recentlySold: { title: string; price: string; when: string }[];
};

function specsNeutral(p: Product): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [
    { label: 'Category', value: p.category.charAt(0).toUpperCase() + p.category.slice(1) },
    { label: 'Condition', value: p.conditionGrade ?? 'See listing photos' },
  ];
  if (p.shipsFromRegion) {
    rows.push({ label: 'Ships from', value: p.shipsFromRegion });
  }
  if (p.vaultVerified) {
    rows.push({ label: 'Vault lane', value: 'Vault verified inventory' });
  }
  return rows;
}

function formatShippingLine(p: Product): string | null {
  const parts: string[] = [];
  if (p.handlingTimeLabel && p.handlingTimeLabel !== '—') {
    parts.push(`Handling ${p.handlingTimeLabel}`);
  }
  if (p.shippingPriceUsd != null && p.shippingPriceUsd >= 0) {
    parts.push(p.shippingPriceUsd === 0 ? 'Shipping calculated at checkout' : `Shipping from $${p.shippingPriceUsd}`);
  }
  if (p.signatureRequired) {
    parts.push('Signature required');
  }
  return parts.length ? parts.join(' · ') : null;
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

  const shippingLine = formatShippingLine(product);
  const description = product.description?.trim() || null;

  return {
    gallery: buildListingGallerySlides(product),
    sellerLevelBadge: resolvePublicSellerLevelLabel(product.sellerLevel, product.sellerLevelLabel),
    showVaultVerifiedBadge: product.vaultVerified,
    activity: {
      watching,
      offersPending: offers,
      vaultSaves: saves,
      recentlyViewedLabel: 'Quiet until the first collectors land on this page',
      priceUpdatedLabel: undefined,
      sellerLive: false,
      featuredInLive: product.featuredInLive,
    },
    trade: {
      allowOffers: product.allowOffers === true,
      acceptsTrades: product.acceptTradeOffers === true,
      tradeEligible: product.acceptTradeOffers === true,
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
      liveSchedule: 'Follow the seller — live schedule publishes when they go on air.',
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
      acquisitionTag: 'Vault marketplace listing',
      description,
      conditionNotes: product.conditionGrade ? `Listed as ${product.conditionGrade}.` : null,
      authDetails: product.vaultVerified
        ? 'Vault verified inventory with photographic chain of custody where applicable.'
        : null,
      shippingProtection: shippingLine,
      collectorInterest: null,
    },
    liveAppearances: product.liveAppearances ?? [],
    similarProductIds: [],
    recentlySold: [],
  };
}
