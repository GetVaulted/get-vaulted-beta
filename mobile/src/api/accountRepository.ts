import { getWebApiBaseUrl } from '../lib/webApiBaseUrl';

export type AccountDeletionBlocker = {
  code: string;
  message: string;
};

export async function fetchAccountDeletionBlockers(
  accessToken: string,
): Promise<AccountDeletionBlocker[]> {
  const base = getWebApiBaseUrl();
  if (!base) return [{ code: 'config', message: 'App not configured.' }];

  const res = await fetch(`${base.replace(/\/$/, '')}/api/account`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
  });
  const data = (await res.json().catch(() => ({}))) as { blockers?: AccountDeletionBlocker[]; error?: string };
  if (!res.ok) return [{ code: 'error', message: data.error ?? 'Could not load deletion requirements.' }];
  return Array.isArray(data.blockers) ? data.blockers : [];
}

export async function deleteAccountApi(
  accessToken: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const base = getWebApiBaseUrl();
  if (!base) return { ok: false, error: 'App not configured.' };

  const res = await fetch(`${base.replace(/\/$/, '')}/api/account`, {
    method: 'DELETE',
    headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) return { ok: false, error: data.error ?? 'Could not delete account.' };
  return { ok: true };
}
