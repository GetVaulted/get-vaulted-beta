import { fetchWebApiAuthed } from '../lib/fetchWebApiAuthed';

async function readJson<T>(res: Response): Promise<T & { error?: string }> {
  return (await res.json().catch(() => ({}))) as T & { error?: string };
}

async function adminGet<T>(path: string, token: string): Promise<T> {
  const res = await fetchWebApiAuthed(path, token);
  const data = await readJson<T>(res);
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

async function adminMutate<T>(
  path: string,
  token: string,
  method: 'POST' | 'PATCH',
  body: unknown,
): Promise<T> {
  const res = await fetchWebApiAuthed(path, token, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await readJson<T>(res);
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

// —— Live shows ——
export type AdminLiveShow = {
  id: string;
  title: string;
  status: string;
  host: { id: string; username: string; email: string };
  viewerCount: number;
  bidCount: number;
  reportCount: number;
  streamHealth: string;
  streamMode: string;
  streamStartedAt: string | null;
  scheduledStartAt: string | null;
  ivsCompositionArn: string | null;
  activeItem: { id: string; title: string; currentBidUsd: number | null } | null;
};

export function fetchAdminLiveShows(token: string, status: string) {
  const q = status && status !== 'all' ? `?status=${encodeURIComponent(status)}` : '';
  return adminGet<{ shows: AdminLiveShow[] }>(`/api/admin/live-shows${q}`, token);
}

export function postAdminLiveShowAction(
  token: string,
  id: string,
  action: 'end' | 'cancel' | 'flag',
  note?: string,
) {
  return adminMutate<{ ok: true; reportId?: string; alreadyFlagged?: boolean }>(
    `/api/admin/live-shows/${encodeURIComponent(id)}/actions`,
    token,
    'POST',
    { action, note },
  );
}

// —— Support ——
export type AdminSupportTicket = {
  id: string;
  userId: string;
  username: string;
  category: string;
  categoryLabel: string;
  subject: string;
  message: string;
  contactEmail: string | null;
  referenceType: string | null;
  referenceId: string | null;
  status: string;
  statusLabel: string;
  adminNotes: string | null;
  assignedAdminUsername: string | null;
  resolvedAt: string | null;
  createdAt: string;
};

export function fetchAdminSupportTickets(token: string, opts?: { status?: string; q?: string }) {
  const params = new URLSearchParams();
  if (opts?.status) params.set('status', opts.status);
  if (opts?.q?.trim()) params.set('q', opts.q.trim());
  const qs = params.toString();
  return adminGet<{ tickets: AdminSupportTicket[]; openCount: number }>(
    `/api/admin/support-tickets${qs ? `?${qs}` : ''}`,
    token,
  );
}

export function fetchAdminSupportTicket(token: string, id: string) {
  return adminGet<{ ticket: AdminSupportTicket }>(
    `/api/admin/support-tickets/${encodeURIComponent(id)}`,
    token,
  );
}

export function patchAdminSupportTicket(
  token: string,
  id: string,
  body: { status?: string; adminNotes?: string },
) {
  return adminMutate<{ ticket: AdminSupportTicket }>(
    `/api/admin/support-tickets/${encodeURIComponent(id)}`,
    token,
    'PATCH',
    body,
  );
}

// —— Reports ——
export type AdminReport = {
  id: string;
  reporterUserId: string;
  targetType: string;
  targetId: string;
  reason: string;
  description: string | null;
  status: string;
  moderationNotes: string | null;
  liveRoomId: string | null;
  createdAt: string;
  resolvedAt: string | null;
  reporter: { id: string; username: string } | null;
  assignedAdmin: { id: string; username: string } | null;
};

export function fetchAdminReports(token: string, opts?: { status?: string; q?: string }) {
  const params = new URLSearchParams();
  if (opts?.status) params.set('status', opts.status);
  if (opts?.q?.trim()) params.set('q', opts.q.trim());
  const qs = params.toString();
  return adminGet<{ reports: AdminReport[] }>(`/api/admin/reports${qs ? `?${qs}` : ''}`, token);
}

export function fetchAdminReport(token: string, id: string) {
  return adminGet<{
    report: AdminReport;
    reporterEmail: string;
    auditLogs: { id: string; action: string; createdAt: string; actor: { username: string } | null }[];
  }>(`/api/admin/reports/${encodeURIComponent(id)}`, token);
}

export function patchAdminReport(
  token: string,
  id: string,
  body: { action: 'assign' | 'reviewing' | 'resolve' | 'dismiss' | 'note'; moderationNotes?: string },
) {
  return adminMutate<{ report: AdminReport }>(
    `/api/admin/reports/${encodeURIComponent(id)}`,
    token,
    'PATCH',
    body,
  );
}

// —— Orders / refunds ——
export type AdminOrderRow = {
  id: string;
  status: string;
  totalUsd: number;
  createdAt: string;
  listingTitle: string;
  buyerUsername: string;
  sellerUsername: string;
};

export type AdminRefundRequest = {
  id: string;
  orderId: string;
  kind: string;
  status: string;
  reason: string | null;
  supportNote: string | null;
  orderTotalUsd?: number;
  listingTitle?: string;
  buyerUsername?: string;
  sellerUsername?: string;
  createdAt: string;
  stuckForMs?: number;
};

export function fetchAdminOrders(token: string, status?: string) {
  const q = status && status !== 'all' ? `?status=${encodeURIComponent(status)}` : '';
  return adminGet<{ orders: AdminOrderRow[] }>(`/api/admin/orders${q}`, token);
}

export function fetchAdminOrder(token: string, id: string) {
  return adminGet<{ order: Record<string, unknown> }>(`/api/admin/orders/${encodeURIComponent(id)}`, token);
}

export function fetchAdminRefundRequests(token: string) {
  return adminGet<{ requests: AdminRefundRequest[]; stuckRequests: AdminRefundRequest[] }>(
    '/api/admin/refund-requests',
    token,
  );
}

export function patchAdminRefundRequest(token: string, id: string, approve: boolean, note?: string) {
  return adminMutate<{ request: AdminRefundRequest }>(
    `/api/admin/refund-requests/${encodeURIComponent(id)}`,
    token,
    'PATCH',
    { approve, note },
  );
}

export function postAdminRefundRetry(token: string, id: string) {
  return adminMutate<{ request: AdminRefundRequest }>(
    `/api/admin/refund-requests/${encodeURIComponent(id)}/retry`,
    token,
    'POST',
    {},
  );
}

// —— Moderation ——
export type AdminListingRow = {
  id: string;
  title: string;
  category: string;
  status: string;
  priceUsd: number | null;
  sellerUsername: string;
  channel: string;
  moderationRemovedAt: string | null;
  adminReviewedAt: string | null;
  createdAt: string;
};

export function fetchAdminListings(
  token: string,
  opts?: { status?: string; page?: number; seller?: string },
) {
  const params = new URLSearchParams();
  if (opts?.status) params.set('status', opts.status);
  if (opts?.page) params.set('page', String(opts.page));
  if (opts?.seller?.trim()) params.set('seller', opts.seller.trim());
  params.set('pageSize', '40');
  return adminGet<{
    listings: AdminListingRow[];
    page: number;
    totalPages: number;
    total: number;
  }>(`/api/admin/listings?${params.toString()}`, token);
}

export function patchAdminListing(
  token: string,
  id: string,
  action: 'remove' | 'restore' | 'mark_reviewed',
  reason?: string,
) {
  return adminMutate<{ ok: true }>(`/api/admin/listings/${encodeURIComponent(id)}`, token, 'PATCH', {
    action,
    reason,
  });
}

// —— Users ——
export type AdminUserRow = {
  id: string;
  email: string;
  username: string;
  role: string;
  suspendedAt: string | null;
  createdAt: string;
};

export function fetchAdminUsers(token: string, q?: string) {
  const qs = q?.trim() ? `?q=${encodeURIComponent(q.trim())}` : '';
  return adminGet<{ users: AdminUserRow[] }>(`/api/admin/users${qs}`, token);
}

export function patchAdminUser(
  token: string,
  id: string,
  action: 'suspend' | 'unsuspend',
  reason?: string,
) {
  return adminMutate<{ ok: true; liveShowsEnded?: number; liveShowsCancelled?: number }>(
    `/api/admin/users/${encodeURIComponent(id)}`,
    token,
    'PATCH',
    { action, reason },
  );
}

// —— Notifications ——
export type AdminBroadcast = {
  id: string;
  title: string;
  body: string;
  href: string | null;
  audience: string;
  recipientCount: number;
  pushSentCount: number;
  createdByUsername: string | null;
  createdAt: string;
};

export function fetchAdminBroadcasts(token: string) {
  return adminGet<{ broadcasts: AdminBroadcast[] }>('/api/admin/notifications/broadcast', token);
}

export function postAdminBroadcast(
  token: string,
  body: { title: string; body: string; href?: string | null },
) {
  return adminMutate<{ ok: true; broadcastId: string; recipientCount: number; pushSentCount: number }>(
    '/api/admin/notifications/broadcast',
    token,
    'POST',
    body,
  );
}

// —— Seller risk ——
export type AdminSellerRisk = {
  id: string;
  username: string;
  email: string;
  fastPayoutStatus: string | null;
  instantPayoutApprovalStatus: string | null;
  suspendedAt: string | null;
  sellerLevel: string | null;
  metrics: {
    lifetimeGmvUsd: number;
    disputeRate: number;
    accountStanding: string;
    payoutExposureUsd: number;
  } | null;
};

export function fetchAdminSellerRisk(token: string, pending?: boolean) {
  const q = pending ? '?pending=1' : '';
  return adminGet<{ sellers: AdminSellerRisk[] }>(`/api/admin/seller-risk${q}`, token);
}

// —— Health ——
export type AdminHealthCheck = {
  id: string;
  label: string;
  status: 'ok' | 'degraded' | 'unknown' | 'error';
  detail?: string | null;
  issue?: string | null;
  solution?: string | null;
};

export function fetchAdminHealth(token: string) {
  return adminGet<{
    overall: string;
    checks: AdminHealthCheck[];
    recentIssues: { id: string; title: string; createdAt: string }[];
    updatedAt: string;
  }>('/api/admin/health', token);
}
