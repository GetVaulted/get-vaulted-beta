import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Platform, Share } from 'react-native';
import { canonicalListingShareUrl, shareListingNative } from './shareListingNative';

// Bug fix regression: sharing a listing used to omit the `url` entirely (plain text only,
// no link, no rich unfurl) — unlike the working live-show share flow.
describe('canonicalListingShareUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('builds the public PDP link from the production site by default', () => {
    expect(canonicalListingShareUrl('listing-123')).toBe('https://shopgetvaulted.com/listing/listing-123');
  });

  it('encodes the listing id', () => {
    expect(canonicalListingShareUrl('id with spaces')).toBe(
      'https://shopgetvaulted.com/listing/id%20with%20spaces',
    );
  });

  it('respects EXPO_PUBLIC_SITE_URL when set', () => {
    vi.stubEnv('EXPO_PUBLIC_SITE_URL', 'https://beta.shopgetvaulted.com');
    expect(canonicalListingShareUrl('listing-123')).toBe('https://beta.shopgetvaulted.com/listing/listing-123');
  });

  it('returns null for a blank listing id', () => {
    expect(canonicalListingShareUrl('  ')).toBeNull();
  });
});

describe('shareListingNative', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (Platform as { OS: string }).OS = 'ios';
  });

  const product = {
    id: 'listing-123',
    title: 'Vintage Rolex',
    listingPrice: '$1,200',
  };

  it('on iOS, shares the bare url so iMessage/etc. can unfurl a rich preview', async () => {
    await shareListingNative(product);

    expect(Share.share).toHaveBeenCalledWith({ url: 'https://shopgetvaulted.com/listing/listing-123' });
  });

  it('on Android, includes the url inside the shared message text', async () => {
    (Platform as { OS: string }).OS = 'android';

    await shareListingNative(product);

    expect(Share.share).toHaveBeenCalledWith({
      title: 'Vintage Rolex',
      message: 'Vintage Rolex — $1,200 on Get Vaulted\nhttps://shopgetvaulted.com/listing/listing-123',
    });
  });

  it('swallows share-sheet cancellation errors and resolves false', async () => {
    vi.mocked(Share.share).mockRejectedValueOnce(new Error('User did not share'));

    await expect(shareListingNative(product)).resolves.toBe(false);
  });
});
