import { fetchWebApiAuthed } from '../lib/fetchWebApiAuthed';

export type ListingCommerceDiagnostics = {
  listing: {
    listingId: string;
    sellerId: string;
    listingStatus: string;
    canonicalStatus: string;
    sellerBucket: string;
    purchasable: boolean;
  };
  orders: Array<{
    orderId: string;
    paymentStatus: string;
    fulfillmentStatus: string;
    status: string;
    sellerBucket: string;
    appearsInSellerOrdersApi: boolean;
  }>;
  layaways: Array<{
    layawayId: string;
    status: string;
    displayStatus: string;
    sellerBucket: string;
    appearsInActiveLayawayList: boolean;
  }>;
  conflicts: string[];
  generatedAt: string;
};

export async function fetchListingCommerceDiagnostics(
  accessToken: string,
  listingId: string,
): Promise<{ listingTitle: string; diagnostics: ListingCommerceDiagnostics } | null> {
  const res = await fetchWebApiAuthed(
    `/api/marketplace/commerce-state/${encodeURIComponent(listingId)}`,
    accessToken,
  );
  const body = (await res.json().catch(() => null)) as {
    listingTitle?: string;
    diagnostics?: ListingCommerceDiagnostics;
    error?: string;
  } | null;
  if (!res.ok || !body?.diagnostics) return null;
  return { listingTitle: body.listingTitle ?? 'Listing', diagnostics: body.diagnostics };
}
