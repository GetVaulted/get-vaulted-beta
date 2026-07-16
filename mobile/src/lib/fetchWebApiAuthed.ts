import { fetchWebApiMobile } from './fetchWebApiMobile';

/** Authenticated mobile → Next.js API (same transport as live-readiness / live-rooms). */
export async function fetchWebApiAuthed(
  path: string,
  accessToken: string,
  init?: RequestInit,
  options?: { timeoutMs?: number },
): Promise<Response> {
  return fetchWebApiMobile(
    path,
    {
      ...init,
      headers: {
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        Authorization: `Bearer ${accessToken}`,
        ...init?.headers,
      },
    },
    options,
  );
}
