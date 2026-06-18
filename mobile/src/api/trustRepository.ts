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
  expiresAt?: string;
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
      expiresAt: args.expiresAt,
      metadata: args.metadata,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) return { ok: false, error: data.error ?? 'Moderation failed.' };
  return { ok: true };
}

export type LiveModeratorLevel = 'chat' | 'show' | 'break' | 'head';
export type LiveViewerRole = 'buyer' | 'host' | 'moderator';

export type LiveRoomModHistoryRow = {
  id: string;
  actionType: string;
  moderatorUserId: string;
  moderatorUsername: string | null;
  targetUserId: string | null;
  targetUsername: string | null;
  targetMessageId: string | null;
  reason: string;
  expiresAt: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

export type LiveRoomModQueueRow = {
  id: string;
  targetType: string;
  targetId: string;
  reason: string;
  description: string;
  reporterUsername: string | null;
  createdAt: string;
};

export type LiveRoomViewerRow = {
  userId: string;
  username: string;
  lastSeenAt: string;
  messageCount: number;
};

export type LiveRoomTipStatus = 'pending' | 'paid' | 'failed';

export type LiveRoomTipRow = {
  id: string;
  amountUsd: number;
  message: string;
  status: LiveRoomTipStatus;
  senderId: string;
  senderUsername: string;
  recipientId: string;
  recipientUsername: string;
  paidAt: string | null;
  createdAt: string;
};

export type LiveRoomTipSummary = {
  totalPaidUsd: number;
  paidCount: number;
  pendingCount: number;
  failedCount: number;
  tipRecipientMode: 'host' | 'moderator';
  tipsToModerator: boolean;
  tipModeratorUsername: string | null;
};

export type LiveRoomModerationSnapshot = {
  canModerate: boolean;
  isHost: boolean;
  isModerator: boolean;
  viewerRole: LiveViewerRole;
  moderatorLevel: LiveModeratorLevel | null;
  allowedActions: string[];
  sellerId?: string;
  slowModeSeconds: number;
  pinnedModeratorMessage: string | null;
  pinnedModeratorMessageAt?: string | null;
  moderators: { userId: string; username: string; moderatorLevel?: LiveModeratorLevel }[];
  modHistory: LiveRoomModHistoryRow[];
  modQueue: LiveRoomModQueueRow[];
  viewers: LiveRoomViewerRow[];
  tips: LiveRoomTipRow[];
  tipSummary: LiveRoomTipSummary | null;
  myRestrictions: {
    muted: boolean;
    roomBanned: boolean;
    bidBlocked: boolean;
    kickedUntil: string | null;
    sellerStreamBanned?: boolean;
  } | null;
};

export async function assignLiveRoomModerator(args: {
  accessToken: string;
  roomId: string;
  userId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const base = getWebApiBaseUrl();
  if (!base) return { ok: false, error: 'Not configured.' };

  const res = await fetch(`${base.replace(/\/$/, '')}/api/live-rooms/${encodeURIComponent(args.roomId)}/moderators`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${args.accessToken}`,
    },
    body: JSON.stringify({ userId: args.userId }),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) return { ok: false, error: data.error ?? 'Could not assign moderator.' };
  return { ok: true };
}

export async function revokeLiveRoomModerator(args: {
  accessToken: string;
  roomId: string;
  userId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const base = getWebApiBaseUrl();
  if (!base) return { ok: false, error: 'Not configured.' };

  const res = await fetch(`${base.replace(/\/$/, '')}/api/live-rooms/${encodeURIComponent(args.roomId)}/moderators`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${args.accessToken}`,
    },
    body: JSON.stringify({ userId: args.userId }),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) return { ok: false, error: data.error ?? 'Could not remove moderator.' };
  return { ok: true };
}

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
