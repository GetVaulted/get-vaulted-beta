import { getWebApiBaseUrl } from '../lib/webApiBaseUrl';

export type ReportTargetType = 'user' | 'listing' | 'live_room' | 'message' | 'order' | 'break';

export type ReportReason =
  | 'harassment'
  | 'counterfeit'
  | 'scam_fraud'
  | 'spam'
  | 'inappropriate_content'
  | 'fake_bids'
  | 'seller_misconduct'
  | 'buyer_misconduct'
  | 'ip_violation'
  | 'other';

export const REPORT_REASONS: ReportReason[] = [
  'harassment',
  'counterfeit',
  'scam_fraud',
  'spam',
  'inappropriate_content',
  'fake_bids',
  'seller_misconduct',
  'buyer_misconduct',
  'ip_violation',
  'other',
];

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  harassment: 'Harassment',
  counterfeit: 'Counterfeit / fake item',
  scam_fraud: 'Scam / fraud',
  spam: 'Spam',
  inappropriate_content: 'Inappropriate content',
  fake_bids: 'Fake bids / shill bidding',
  seller_misconduct: 'Seller misconduct',
  buyer_misconduct: 'Buyer misconduct',
  ip_violation: 'IP / copyright violation',
  other: 'Other',
};

export async function submitReport(args: {
  accessToken?: string;
  targetType: ReportTargetType;
  targetId: string;
  reason: ReportReason;
  description?: string;
  liveRoomId?: string;
}): Promise<{ ok: true; reportId: string } | { ok: false; error: string }> {
  const base = getWebApiBaseUrl();
  if (!base) return { ok: false, error: 'App not configured (EXPO_PUBLIC_SITE_URL).' };

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (args.accessToken) headers.Authorization = `Bearer ${args.accessToken}`;

  const res = await fetch(`${base.replace(/\/$/, '')}/api/reports`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      targetType: args.targetType,
      targetId: args.targetId,
      reason: args.reason,
      description: args.description ?? '',
      liveRoomId: args.liveRoomId,
    }),
  });

  const data = (await res.json().catch(() => ({}))) as { error?: string; reportId?: string };
  if (!res.ok) return { ok: false, error: data.error ?? 'Could not submit report.' };
  return { ok: true, reportId: data.reportId ?? '' };
}

export async function applyLiveModerationAction(args: {
  accessToken: string;
  roomId: string;
  actionType: string;
  targetUserId?: string;
  targetMessageId?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}): Promise<{ ok: boolean; error?: string }> {
  const base = getWebApiBaseUrl();
  if (!base) return { ok: false, error: 'Not configured.' };

  const res = await fetch(`${base.replace(/\/$/, '')}/api/live-rooms/${encodeURIComponent(args.roomId)}/moderation`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${args.accessToken}`,
    },
    body: JSON.stringify({
      actionType: args.actionType,
      targetUserId: args.targetUserId,
      targetMessageId: args.targetMessageId,
      reason: args.reason,
      metadata: args.metadata,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) return { ok: false, error: data.error ?? 'Moderation failed.' };
  return { ok: true };
}

export type LiveRoomModerationSnapshot = {
  canModerate: boolean;
  slowModeSeconds: number;
  pinnedModeratorMessage: string | null;
  myRestrictions: {
    muted: boolean;
    roomBanned: boolean;
    bidBlocked: boolean;
    kickedUntil: string | null;
  } | null;
};

export async function fetchLiveRoomModeration(args: {
  accessToken?: string;
  roomId: string;
}): Promise<LiveRoomModerationSnapshot | null> {
  const base = getWebApiBaseUrl();
  if (!base) return null;

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (args.accessToken) headers.Authorization = `Bearer ${args.accessToken}`;

  const res = await fetch(`${base.replace(/\/$/, '')}/api/live-rooms/${encodeURIComponent(args.roomId)}/moderation`, {
    headers,
  });
  if (!res.ok) return null;
  return (await res.json().catch(() => null)) as LiveRoomModerationSnapshot | null;
}
