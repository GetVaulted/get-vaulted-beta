import type { ListingChannel } from '../createListing/listingChannel';
import {
  countListingPhotos,
  LISTING_MIN_PHOTOS,
  type CreateListingFormState,
  type ListingCommerceType,
  type ListingPreview,
  normalizeAuctionDurationDays,
} from '../createListing/types';
import type { CategoryId } from '../types';
import { getSupabase } from '../lib/supabase';
import { uploadListingMediaForPublish } from './listingMediaRepository';

export class PublishListingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PublishListingError';
  }
}

function mapSupabasePublishError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('row-level security') || m.includes('permission denied')) {
    return 'Permission denied — sign in again and confirm your seller profile is set up.';
  }
  if (m.includes('violates foreign key') && m.includes('seller_id')) {
    return 'Seller profile not found — finish account setup, then try publishing again.';
  }
  if (m.includes('invalid input value for enum')) {
    return 'Listing data was rejected by the server — check category and listing type.';
  }
  if (m.includes('payload too large') || m.includes('entity too large')) {
    return 'Images are too large — try fewer or smaller photos.';
  }
  return message;
}

async function assertSellerProfileExists(sellerId: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new PublishListingError('Supabase is not configured.');
  const { data, error } = await sb.from('profiles').select('id').eq('id', sellerId).maybeSingle();
  if (error) throw new PublishListingError(mapSupabasePublishError(error.message));
  if (!data?.id) {
    throw new PublishListingError('Complete your profile before publishing listings.');
  }
}

export type PublishListingResult = {
  listingId: string;
  preview: ListingPreview;
};

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

function mapAuthenticationStatus(form: CreateListingFormState): string {
  if (form.vaultedVerification) return 'vaulted_verified';
  if (form.verificationSource === 'visible_in_media') return 'visible_in_media';
  if (form.verificationSource === 'seller_provided') return 'seller_declared';
  return 'unknown';
}

function mapShippingTier(category: CategoryId | null): string | null {
  switch (category) {
    case 'cards':
      return 'cards_slabs';
    case 'sneakers':
      return 'sneakers';
    case 'memorabilia':
      return 'memorabilia';
    case 'watches':
    case 'luxury':
      return 'watches_luxury';
    default:
      return 'oversized_custom';
  }
}

function listingStatusForChannel(channel: ListingChannel): 'live' | 'pending' {
  return channel === 'marketplace' ? 'live' : 'pending';
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

function buildDescription(form: CreateListingFormState): string {
  const parts = [form.description.trim()];
  if (form.shippingNotes.trim()) parts.push(`Shipping: ${form.shippingNotes.trim()}`);
  if (form.tags.trim()) parts.push(`Tags: ${form.tags.trim()}`);
  return parts.filter(Boolean).join('\n\n') || '';
}

function buildMetadata(form: CreateListingFormState, channel: ListingChannel): Record<string, unknown> {
  const meta: Record<string, unknown> = {
    listing_channel: channel,
    subcategories: form.subcategories,
    brand: form.brand.trim() || null,
    reference_number: form.referenceNumber.trim() || null,
    year: form.year.trim() || null,
    accessories: form.accessories.trim() || null,
    accept_trades: form.acceptTrades,
    feature_in_live: form.featureInLive,
    published_from: 'mobile',
  };

  if (form.listingType === 'auction' || form.listingType === 'live_auction') {
    meta.auction_duration_days = Number(normalizeAuctionDurationDays(form));
    if (form.reservePrice.trim()) meta.reserve_price = form.reservePrice.trim();
  }

  if (channel === 'marketplace') {
    meta.marketplace_shipping = {
      ship_from_zip: form.shipFromZip.replace(/\D/g, '').slice(0, 5),
      ship_to_zip: form.shipToZip.replace(/\D/g, '').slice(0, 5) || null,
      package_weight_lb: form.packageWeightLb,
      package_weight_oz: form.packageWeightOz,
      package_length_in: form.packageLengthIn,
      package_width_in: form.packageWidthIn,
      package_height_in: form.packageHeightIn,
      handling_fee: form.shippingHandlingFee,
      offer_scope: form.marketplaceShippingOfferScope,
      allowed_rate_keys: form.marketplaceAllowedRateKeys,
      insurance: form.insurance,
      signature: form.signature,
      international: form.international,
      selected_rate: form.selectedShippoRate,
    };
  } else {
    meta.live_shipping = {
      preset: form.liveShippingPreset,
      profile_id: form.liveShippingProfileId,
      ship_from_zip: form.liveShipFromZip.replace(/\D/g, '').slice(0, 5),
      bundle_eligible: form.liveBundleEligible,
      international: form.liveShipInternational,
      handling_surcharge: form.liveHandlingSurcharge,
      show_title: form.liveShowTitle,
      queue_notes: form.queueNotes,
    };
  }

  return meta;
}

export async function publishCreateListingForm(
  sellerId: string,
  form: CreateListingFormState,
): Promise<PublishListingResult> {
  const sb = getSupabase();
  if (!sb) throw new PublishListingError('Supabase is not configured.');

  const { data: sessionData, error: sessionErr } = await sb.auth.getSession();
  if (sessionErr || !sessionData.session?.user?.id) {
    throw new PublishListingError('Sign in to publish listings.');
  }
  if (sessionData.session.user.id !== sellerId) {
    throw new PublishListingError('Session mismatch — sign in again and retry.');
  }

  await assertSellerProfileExists(sellerId);

  const title = form.title.trim();
  if (!title) throw new PublishListingError('Add a title before publishing.');

  if (!form.category) throw new PublishListingError('Choose a category before publishing.');
  if (!form.listingType) throw new PublishListingError('Choose a listing type before publishing.');

  const photoCount = countListingPhotos(form.media);
  if (photoCount < LISTING_MIN_PHOTOS) {
    throw new PublishListingError(`Add at least ${LISTING_MIN_PHOTOS} photos before publishing.`);
  }

  const channel = form.listingChannel ?? 'marketplace';
  const mediaUrls = await uploadListingMediaForPublish(sellerId, form.media);
  const price = resolvePrice(form);
  const subcategory =
    form.subcategories.length > 0 ? form.subcategories.slice(0, 3).join(' · ') : null;

  const row = {
    seller_id: sellerId,
    title,
    description: buildDescription(form),
    category: form.category,
    subcategory,
    price,
    currency: 'usd',
    listing_type: form.listingType,
    condition: form.condition.trim() || null,
    grade: form.grade.trim() || null,
    authentication_status: mapAuthenticationStatus(form),
    media_urls: mediaUrls,
    status: listingStatusForChannel(channel),
    accepts_trades: form.acceptTrades || form.listingType === 'trade_only',
    shipping_weight_tier: mapShippingTier(form.category),
    metadata: buildMetadata(form, channel),
  };

  const { data, error } = await sb.from('listings').insert(row).select('id').single();
  if (error || !data?.id) {
    throw new PublishListingError(
      mapSupabasePublishError(error?.message ?? 'Could not save listing to the vault.'),
    );
  }

  const listingId = data.id as string;
  const preview = buildListingPreview(listingId, form, mediaUrls[0] ?? '');

  return { listingId, preview };
}
