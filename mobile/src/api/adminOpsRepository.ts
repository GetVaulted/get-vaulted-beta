import { fetchWebApiAuthed } from '../lib/fetchWebApiAuthed';

export type AdminOverviewMetrics = {
  liveActive: number;
  liveScheduled: number;
  openReports: number;
  openSupportTickets: number;
  pendingListings: number;
  flaggedListings: number;
  openOrders: number;
  activeLayaways: number;
  sellersPendingPayoutReview: number;
  suspendedUsers: number;
  onlineNow: number;
  onlineByPlatform: { ios: number; android: number; web: number };
  finance: {
    gmvUsd: number | null;
    platformFeesUsd: number | null;
    pendingPayoutsUsd: number | null;
  };
  updatedAt: string;
};

export async function fetchAdminMe(accessToken: string): Promise<boolean> {
  const res = await fetchWebApiAuthed('/api/admin/me', accessToken);
  if (res.status === 401 || res.status === 403) return false;
  if (!res.ok) return false;
  const data = (await res.json().catch(() => ({}))) as { isAdmin?: boolean };
  return data.isAdmin === true;
}

export async function fetchAdminOverview(accessToken: string): Promise<AdminOverviewMetrics> {
  const res = await fetchWebApiAuthed('/api/admin/overview', accessToken);
  const data = (await res.json().catch(() => ({}))) as AdminOverviewMetrics & { error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? `Could not load Ops overview (${res.status})`);
  }
  return data;
}
