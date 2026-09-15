import { fetchWebApiMobileWithSellerAuth } from './resolveSellerAccessToken';

/**
 * Authenticated mobile → Next.js API.
 * Refreshes the Supabase session (and retries once on 401) so long-lived live
 * screens do not fail with "Invalid session" when the React accessToken prop is stale.
 */
export async function fetchWebApiAuthed(
  path: string,
  accessToken: string,
  init?: RequestInit,
  options?: { timeoutMs?: number },
): Promise<Response> {
  return fetchWebApiMobileWithSellerAuth(path, accessToken, init, options);
}
