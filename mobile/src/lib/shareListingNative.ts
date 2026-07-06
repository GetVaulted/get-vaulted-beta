import { Platform, Share } from 'react-native';
import { publicListingPath } from './sellerListingRoutes';
import { getSiteBaseUrl } from './siteUrls';

/** Public share URL: https://shopgetvaulted.com/listing/[listingId] (same PDP route as web). */
export function canonicalListingShareUrl(listingId: string): string | null {
  if (!listingId.trim()) return null;
  return `${getSiteBaseUrl()}${publicListingPath(listingId)}`;
}

export type ShareListingInput = {
  id: string;
  title: string;
  listingPrice: string;
};

/** Opens the OS share sheet with a listing link tuned for rich previews (mirrors shareLiveRoomNative). */
export async function shareListingNative(product: ShareListingInput): Promise<boolean> {
  const url = canonicalListingShareUrl(product.id);
  if (!url) return false;

  try {
    if (Platform.OS === 'ios') {
      // iMessage unfurls OG tiles when the URL is shared directly (not buried in message text).
      await Share.share({ url });
    } else {
      await Share.share({
        title: product.title,
        message: `${product.title} — ${product.listingPrice} on Get Vaulted\n${url}`,
      });
    }
    return true;
  } catch {
    return false;
  }
}
