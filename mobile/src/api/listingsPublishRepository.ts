import type { ListingChannel } from '../createListing/listingChannel';
import {
  countListingPhotos,
  LISTING_MIN_PHOTOS,
  LIVE_INVENTORY_PHOTOS,
  type CreateListingFormState,
  type ListingCommerceType,
  type ListingMediaItem,
  type ListingPreview,
  normalizeAuctionDurationDays,
} from '../createListing/types';
import type { CategoryId } from '../types';
import { prepareListingPhotoForUpload, isRemoteListingImageUri } from '../lib/listingImagePrepare';
import { createPublishTimer, newPublishRequestId } from '../lib/publishTiming';
import {
  webCategoryFromMobileCategory,
  webShippingCategoryFromMobile,
} from './mapWebMarketplaceListing';
import {
  createListingViaWeb,
  getListingsAccessToken,
  uploadListingImageViaWeb,
} from './webListingsRepository';

export class PublishListingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PublishListingError';
  }
}

export type PublishListingResult = {
  listingId: string;
  preview: ListingPreview;
};

export type PublishCreateListingOptions = {
  /** Stable per tap — server dedupes on this id. */
  publishRequestId?: string;
};

/** Coalesce concurrent publish calls (double tap, StrictMode) into one in-flight request. */
let inFlightPublish: Promise<PublishListingResult> | null = null;
let inFlightPublishRequestId: string | null = null;

function parseUsdAmount(raw: string, label: string): number {
  const n = Number(String(raw).replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(n) || n <= 0) {
    throw new PublishListingError(`Enter a valid ${label}.`);
  }
  return Math.round(n * 100) / 100;
}

function resolvePrice(form: CreateListingFormState): number {
  switch (form.listingType) {
    case 'buy_now':
    case 'vault_drop':
      return parseUsdAmount(form.buyNowPrice, 'buy-now price');
    case 'auction':
    case 'live_auction':
      return parseUsdAmount(form.startingBid || form.buyNowPrice, 'starting bid');
    case 'break_spot':
      return parseUsdAmount(form.spotPrice || form.buyNowPrice, 'spot price');
    case 'trade_only':
      return 1;
    default:
      throw new PublishListingError('Choose a listing type before publishing.');
  }
}

function previewStatus(t: ListingCommerceType | null): ListingPreview['status'] {
  switch (t) {
    case 'auction':
    case 'live_auction':
      return 'in_auction';
    case 'break_spot':
      return 'pending';
    default:
      return 'active';
  }
}

function previewPriceLabel(form: CreateListingFormState): string {
  switch (form.listingType) {
    case 'buy_now':
    case 'vault_drop':
      return form.buyNowPrice.trim() || '—';
    case 'auction':
    case 'live_auction':
      return form.startingBid.trim() ? `From ${form.startingBid}` : 'Auction';
    case 'break_spot':
      return form.spotPrice.trim() ? `${form.spotPrice}/spot` : 'Break spots';
    case 'trade_only':
      return 'Trade offers';
    default:
      return '—';
  }
}

export function buildListingPreview(
  listingId: string,
  form: CreateListingFormState,
  imageUrl: string,
): ListingPreview {
  const channel = form.listingChannel ?? 'marketplace';
  return {
    id: listingId,
    title: form.title.trim() || 'New vault listing',
    imageUrl,
    price: previewPriceLabel(form),
    status: previewStatus(form.listingType),
    watches: 0,
    live: channel === 'live_show',
    channel,
  };
}

async function uploadListingImagesForWeb(
  accessToken: string,
  media: ListingMediaItem[],
  channel: ListingChannel,
  timer: ReturnType<typeof createPublishTimer>,
): Promise<string[]> {
  const photos = media.filter((m) => m.kind === 'photo');
  if (channel === 'live_show') {
    if (photos.length !== LIVE_INVENTORY_PHOTOS) {
      throw new PublishListingError('Upload 1 thumbnail image.');
    }
  } else if (photos.length < LISTING_MIN_PHOTOS) {
    throw new PublishListingError(`Add at least ${LISTING_MIN_PHOTOS} photos before publishing.`);
  }

  const photosToUpload = channel === 'live_show' ? photos.slice(0, LIVE_INVENTORY_PHOTOS) : photos;

  const prepared = await Promise.all(
    photosToUpload.map(async (item) => {
      if (isRemoteListingImageUri(item.uri)) return item.uri;
      return prepareListingPhotoForUpload(item.uri);
    }),
  );
  timer.mark(`compress (${photosToUpload.length} photos)`);

  const urls = await Promise.all(
    prepared.map(async (uri, index) => {
      if (isRemoteListingImageUri(uri)) return uri;
      try {
        return await uploadListingImageViaWeb(accessToken, uri);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new PublishListingError(msg || `Photo ${index + 1} upload failed.`);
      }
    }),
  );
  timer.mark(`upload (${photosToUpload.length} photos)`);
  return urls;
}

function packageWeightOzTotal(form: CreateListingFormState): number {
  const lb = Number(String(form.packageWeightLb).replace(/[^0-9.]/g, '')) || 0;
  const oz = Number(String(form.packageWeightOz).replace(/[^0-9.]/g, '')) || 0;
  const total = lb * 16 + oz;
  if (total > 0) return total;
  const cat = webShippingCategoryFromMobile(form.category as CategoryId);
  return cat === 'slab' ? 5 : 4;
}

function parcelInches(
  form: CreateListingFormState,
  field: 'packageLengthIn' | 'packageWidthIn' | 'packageHeightIn',
): number {
  const n = Number(String(form[field]).replace(/[^0-9.]/g, ''));
  if (Number.isFinite(n) && n > 0) return n;
  const cat = webShippingCategoryFromMobile(form.category as CategoryId);
  if (cat === 'slab') {
    if (field === 'packageLengthIn') return 7;
    if (field === 'packageWidthIn') return 5;
    return 1;
  }
  if (field === 'packageHeightIn') return 1;
  return field === 'packageLengthIn' ? 6 : 4;
}

function buyingFormatFromListingType(t: ListingCommerceType | null): 'buy_now' | 'auction' {
  if (t === 'auction' || t === 'live_auction') return 'auction';
  return 'buy_now';
}

function publishStatus(
  channel: ListingChannel,
  listingType: ListingCommerceType | null,
): 'active' | 'auction_live' | 'draft' {
  if (channel === 'live_show') return 'draft';
  return 'active';
}

function shippingWeightsForCategory(shippingCategory: string): { base: number; incremental: number } {
  switch (shippingCategory) {
    case 'slab':
      return { base: 5, incremental: 2 };
    case 'small_collectible':
      return { base: 6, incremental: 2 };
    case 'custom':
      return { base: 4, incremental: 1 };
    case 'raw_card':
    default:
      return { base: 4, incremental: 1 };
  }
}

function webPlatformShippingSlugFromCategory(category: CategoryId): string {
  const c = String(category).toLowerCase();
  if (c.includes('graded') || c.includes('slab')) return 'graded_card';
  if (c.includes('sneaker') || c.includes('shoe')) return 'sneakers';
  if (c.includes('watch')) return 'watch';
  if (c.includes('helmet')) return 'full_size_helmet';
  if (c.includes('jersey') || c.includes('apparel')) return 'jersey';
  if (c.includes('funko') || c.includes('collectible')) return 'funko_collectible';
  if (c.includes('lot')) return 'card_lot';
  return 'trading_cards';
}

function buildWebListingBody(
  form: CreateListingFormState,
  imageUrls: string[],
  channel: ListingChannel,
  publishRequestId: string,
): Record<string, unknown> {
  const listingType = form.listingType;
  const buyingFormat = buyingFormatFromListingType(listingType);
  const status = publishStatus(channel, listingType);
  const price = resolvePrice(form);
  const category = form.category as CategoryId;
  const shippingCategory = webShippingCategoryFromMobile(category);
  const shippingWeights = shippingWeightsForCategory(shippingCategory);

  if (channel === 'marketplace' && listingType === 'auction') {
    throw new PublishListingError(
      'Marketplace timed auctions are no longer available. Use Live Shows for auctions.',
    );
  }

  const body: Record<string, unknown> = {
    publishRequestId,
    inventoryChannel: channel,
    title: form.title.trim(),
    description: form.description.trim(),
    category: webCategoryFromMobileCategory(category),
    condition: form.condition.trim() || 'Other',
    buyingFormat,
    status,
    images: imageUrls,
    allowOffers: channel === 'marketplace' ? Boolean(form.allowOffers) : false,
    allowLayaway: channel === 'marketplace' ? Boolean(form.allowLayaway) : false,
    acceptTradeOffers: form.acceptTrades || listingType === 'trade_only',
    signatureRequired: Boolean(form.signature),
    vaultPick: Boolean(form.vaultedVerification),
    shippingPriceUsd: 0,
    marketplaceShippingOfferScope: form.marketplaceShippingOfferScope,
    marketplaceAllowedRateKeys: form.marketplaceAllowedRateKeys,
    marketplaceAllowedCarriers: form.marketplaceAllowedCarriers,
    handlingTime: form.shippingNotes.trim() || '—',
    shippingCategory,
    platformShippingProfileSlug: webPlatformShippingSlugFromCategory(category),
    shippingBaseWeightOz: shippingWeights.base,
    shippingIncrementalWeightOz: shippingWeights.incremental,
    parcelWeightOz: packageWeightOzTotal(form),
    parcelLengthIn: parcelInches(form, 'packageLengthIn'),
    parcelWidthIn: parcelInches(form, 'packageWidthIn'),
    parcelHeightIn: parcelInches(form, 'packageHeightIn'),
  };

  if (buyingFormat === 'buy_now') {
    body.priceUsd = price;
  } else {
    body.startingBidUsd = price;
    body.auctionDurationDays = Number(normalizeAuctionDurationDays(form));
    if (form.reservePrice.trim()) {
      body.reservePriceUsd = parseUsdAmount(form.reservePrice, 'reserve price');
    }
  }

  return body;
}

async function runPublishCreateListingForm(
  sellerId: string,
  form: CreateListingFormState,
  publishRequestId: string,
): Promise<PublishListingResult> {
  const timer = createPublishTimer();
  const title = form.title.trim();
  if (!title) throw new PublishListingError('Add a title before publishing.');
  if (!form.category) throw new PublishListingError('Choose a category before publishing.');
  if (!form.listingType) throw new PublishListingError('Choose a listing type before publishing.');

  const photoCount = countListingPhotos(form.media);
  const channel = form.listingChannel ?? 'marketplace';
  if (channel === 'live_show') {
    if (photoCount !== LIVE_INVENTORY_PHOTOS) {
      throw new PublishListingError('Upload 1 thumbnail image.');
    }
  } else if (photoCount < LISTING_MIN_PHOTOS) {
    throw new PublishListingError(`Add at least ${LISTING_MIN_PHOTOS} photos before publishing.`);
  }

  let accessToken: string;
  try {
    accessToken = await getListingsAccessToken();
  } catch (e) {
    throw new PublishListingError(e instanceof Error ? e.message : 'Sign in to publish listings.');
  }
  timer.mark('auth token');

  const imageUrls = await uploadListingImagesForWeb(accessToken, form.media, channel, timer);
  const body = buildWebListingBody(form, imageUrls, channel, publishRequestId);

  if (__DEV__) {
    console.info('[publishCreateListingForm] POST /api/listings', {
      publishRequestId,
      title: body.title,
      imageCount: imageUrls.length,
    });
  }

  let listingId: string;
  try {
    const created = await createListingViaWeb(accessToken, body);
    listingId = created.listingId;
  } catch (e) {
    throw new PublishListingError(e instanceof Error ? e.message : 'Could not save listing.');
  }
  timer.mark('create listing');

  if (!listingId) {
    throw new PublishListingError('Listing was saved but no id was returned.');
  }

  void sellerId;
  timer.finish();
  const preview = buildListingPreview(listingId, form, imageUrls[0] ?? '');
  return { listingId, preview };
}

export async function publishCreateListingForm(
  sellerId: string,
  form: CreateListingFormState,
  opts?: PublishCreateListingOptions,
): Promise<PublishListingResult> {
  const publishRequestId = opts?.publishRequestId?.trim() || newPublishRequestId();

  if (inFlightPublish && inFlightPublishRequestId === publishRequestId) {
    console.warn('[publish] coalescing duplicate in-flight publish', { publishRequestId });
    return inFlightPublish;
  }
  if (inFlightPublish) {
    throw new PublishListingError('A publish is already in progress. Please wait.');
  }

  inFlightPublishRequestId = publishRequestId;
  inFlightPublish = runPublishCreateListingForm(sellerId, form, publishRequestId);
  try {
    return await inFlightPublish;
  } finally {
    inFlightPublish = null;
    inFlightPublishRequestId = null;
  }
}

export { newPublishRequestId };
