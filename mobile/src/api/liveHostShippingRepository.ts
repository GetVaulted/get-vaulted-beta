import { fetchWebApiMobileWithSellerAuth } from '../lib/resolveSellerAccessToken';
import { resolveSellerShippingProfileIdForCategory } from '../lib/liveShowCategoryShippingProfile';

export type LiveHostShippingProfileOption = {
  id: string;
  name: string;
  sourceSlug?: string;
  isDefault?: boolean;
  defaultWeightOz?: number;
  defaultLengthIn?: number;
  defaultWidthIn?: number;
  defaultHeightIn?: number;
  incrementalWeightOz?: number | null;
};

export type LiveHostShippingDashboard = {
  room: {
    category?: string | null;
    defaultShippingProfileId: string | null;
    defaultSellerShippingProfileId: string | null;
  };
  profiles: LiveHostShippingProfileOption[];
  sellerProfiles: LiveHostShippingProfileOption[];
};

export async function fetchSellerShippingProfiles(
  accessToken: string,
): Promise<LiveHostShippingProfileOption[]> {
  const res = await fetchWebApiMobileWithSellerAuth('/api/account/seller/shipping-profiles', accessToken);
  if (res.status === 401) {
    throw new Error('Session expired. Sign in again to load shipping profiles.');
  }
  if (!res.ok) {
    throw new Error('Could not load shipping profiles from the server.');
  }
  const body = (await res.json().catch(() => null)) as {
    profiles?: LiveHostShippingProfileOption[];
  } | null;
  return Array.isArray(body?.profiles) ? body.profiles : [];
}

export async function fetchLiveHostShippingDashboard(
  accessToken: string,
  liveRoomId: string,
): Promise<LiveHostShippingDashboard | null> {
  const res = await fetchWebApiMobileWithSellerAuth(
    `/api/live-rooms/${encodeURIComponent(liveRoomId)}/host-shipping`,
    accessToken,
  );
  if (!res.ok) return null;
  const body = (await res.json().catch(() => null)) as LiveHostShippingDashboard | null;
  if (!body?.room) return null;
  return body;
}

export function liveHostShippingProfileOptions(dashboard: LiveHostShippingDashboard): LiveHostShippingProfileOption[] {
  return dashboard.sellerProfiles.length > 0 ? dashboard.sellerProfiles : dashboard.profiles;
}

export function liveHostDefaultProfileId(dashboard: LiveHostShippingDashboard): string {
  const options = liveHostShippingProfileOptions(dashboard);
  const fromCategory = resolveSellerShippingProfileIdForCategory(
    options.map((p) => ({
      id: p.id,
      sourceSlug: p.sourceSlug ?? '',
      isDefault: p.isDefault,
    })),
    dashboard.room.category ?? null,
  );
  if (fromCategory) return fromCategory;
  return (
    dashboard.room.defaultSellerShippingProfileId?.trim() ||
    dashboard.room.defaultShippingProfileId?.trim() ||
    options[0]?.id ||
    ''
  );
}
