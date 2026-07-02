import { fetchWebApiAuthed } from '../lib/fetchWebApiAuthed';
import type { SupportCategory, SupportTicket, SupportTicketStatus } from '../platform/types';

type ApiTicket = {
  id: string;
  userId: string;
  category: SupportCategory;
  subject: string;
  message: string;
  contactEmail: string;
  referenceType: string | null;
  referenceId: string | null;
  status: SupportTicketStatus;
  createdAt: string;
  updatedAt: string;
};

function mapTicket(row: ApiTicket): SupportTicket {
  return {
    id: row.id,
    userId: row.userId,
    category: row.category,
    subject: row.subject,
    message: row.message,
    contactEmail: row.contactEmail,
    referenceType: row.referenceType ?? undefined,
    referenceId: row.referenceId ?? undefined,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function apiErrorMessage(res: Response, body: unknown): string {
  if (body && typeof body === 'object' && 'error' in body) {
    const err = (body as { error?: string }).error;
    if (typeof err === 'string' && err.trim()) return err.trim();
  }
  return `Request failed (${res.status})`;
}

export async function fetchMySupportTickets(accessToken: string): Promise<SupportTicket[]> {
  const res = await fetchWebApiAuthed('/api/support/tickets', accessToken);
  const j = (await res.json()) as { tickets?: ApiTicket[]; error?: string };
  if (!res.ok) throw new Error(apiErrorMessage(res, j));
  return (j.tickets ?? []).map(mapTicket);
}

export async function fetchSupportTicket(accessToken: string, id: string): Promise<SupportTicket | null> {
  const res = await fetchWebApiAuthed(`/api/support/tickets/${encodeURIComponent(id)}`, accessToken);
  if (res.status === 404) return null;
  const j = (await res.json()) as { ticket?: ApiTicket; error?: string };
  if (!res.ok) throw new Error(apiErrorMessage(res, j));
  return j.ticket ? mapTicket(j.ticket) : null;
}

export async function createSupportTicket(
  accessToken: string,
  input: {
    category: SupportCategory;
    subject: string;
    message: string;
    contactEmail?: string;
    referenceType?: string;
    referenceId?: string;
  },
): Promise<SupportTicket> {
  const res = await fetchWebApiAuthed('/api/support/tickets', accessToken, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  const j = (await res.json()) as { ticket?: ApiTicket; error?: string };
  if (!res.ok) throw new Error(apiErrorMessage(res, j));
  if (!j.ticket) throw new Error('Ticket not returned');
  return mapTicket(j.ticket);
}
