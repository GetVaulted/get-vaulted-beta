import { fetchWebApiAuthed } from '../lib/fetchWebApiAuthed';

export type PayoutTierChecklistItem = {
  key: string;
  label: string;
  met: boolean;
  pending?: boolean;
  current?: string;
  required?: string;
};

export type SellerPayoutTierResponse = {
  currentTier: string;
  currentTierLabel: string;
  releaseDescription: string;
  sellerLevel: string;
  sellerLevelLabel: string;
  instantApprovalStatus: string;
  instantApprovalLabel: string;
  nextTier: string | null;
  progressChecklist: PayoutTierChecklistItem[];
  metrics: {
    lifetimeGmvUsd: number;
    completedOrders: number;
    accountStanding: string;
    accountStandingLabel: string;
    accountAgeDays: number;
  };
  suspensionReason: string | null;
  rejectionReason: string | null;
  education: { title: string; body: string };
};

export async function fetchSellerPayoutTier(accessToken: string): Promise<SellerPayoutTierResponse> {
  const res = await fetchWebApiAuthed('/api/account/payout-tier', accessToken);
  const j = (await res.json().catch(() => ({}))) as SellerPayoutTierResponse & { error?: string };
  if (!res.ok) {
    throw new Error(typeof j.error === 'string' ? j.error : `Request failed (${res.status})`);
  }
  return j;
}
