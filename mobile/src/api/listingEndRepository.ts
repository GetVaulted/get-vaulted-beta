import { fetchWebApi, getListingsAccessToken } from './webListingsRepository';

export type ListingEndReasonCategory =
  | 'item_damaged'
  | 'listing_mistake'
  | 'inventory_unavailable'
  | 'suspected_fraud'
  | 'shipping_issue'
  | 'other';

export type ListingEndRequestStatus = 'pending' | 'approved' | 'denied' | 'canceled_by_seller';

export type WebListingEndRequest = {
  id: string;
  listingId: string;
  sellerId: string;
  status: ListingEndRequestStatus;
  reasonCategory: ListingEndReasonCategory;
  reasonText: string;
  adminNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
  reviewedById: string | null;
};

export const END_REASON_OPTIONS: { id: ListingEndReasonCategory; label: string }[] = [
  { id: 'item_damaged', label: 'Item damaged' },
  { id: 'listing_mistake', label: 'Listing mistake' },
  { id: 'inventory_unavailable', label: 'Inventory unavailable' },
  { id: 'suspected_fraud', label: 'Suspected fraud' },
  { id: 'shipping_issue', label: 'Shipping issue' },
  { id: 'other', label: 'Other' },
];

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getListingsAccessToken();
  return { Authorization: `Bearer ${token}` };
}

export async function endSellerListing(listingId: string): Promise<void> {
  const res = await fetchWebApi(`/api/listings/${encodeURIComponent(listingId)}/end`, {
    method: 'POST',
    headers: await authHeaders(),
  });
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  if (!res.ok) {
    throw new Error(body?.error ?? 'Could not end listing.');
  }
  console.info('[listing-end] seller ended listing', { listingId });
}

export async function submitListingEndRequest(
  listingId: string,
  input: { reasonCategory: ListingEndReasonCategory; reasonText: string },
): Promise<WebListingEndRequest> {
  const res = await fetchWebApi(`/api/listings/${encodeURIComponent(listingId)}/end-request`, {
    method: 'POST',
    headers: {
      ...(await authHeaders()),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  const body = (await res.json().catch(() => null)) as {
    endRequest?: WebListingEndRequest;
    error?: string;
  } | null;
  if (!res.ok) {
    throw new Error(body?.error ?? 'Could not submit end request.');
  }
  if (!body?.endRequest) throw new Error('No end request returned.');
  console.info('[listing-end] end request submitted', { listingId, requestId: body.endRequest.id });
  return body.endRequest;
}

export async function cancelListingEndRequest(listingId: string, requestId: string): Promise<WebListingEndRequest> {
  const res = await fetchWebApi(
    `/api/listings/${encodeURIComponent(listingId)}/end-request?requestId=${encodeURIComponent(requestId)}`,
    {
      method: 'DELETE',
      headers: await authHeaders(),
    },
  );
  const body = (await res.json().catch(() => null)) as {
    endRequest?: WebListingEndRequest;
    error?: string;
  } | null;
  if (!res.ok) {
    throw new Error(body?.error ?? 'Could not cancel request.');
  }
  if (!body?.endRequest) throw new Error('No end request returned.');
  return body.endRequest;
}
