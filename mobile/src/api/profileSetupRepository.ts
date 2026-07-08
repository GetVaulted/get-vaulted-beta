import { fetchWebApiAuthed } from '../lib/fetchWebApiAuthed';

export type ProfileSetupStatus = {
  needsSetup: boolean;
  username: string;
  referralAlreadySet: boolean;
};

export type UsernameChangeStatus = {
  username: string;
  usernameChosenAt: string | null;
  canChange: boolean;
  reason: 'lock' | 'open_orders' | null;
  lockExpiresAt: string | null;
  hasOpenOrders: boolean;
};

export async function fetchProfileSetupStatus(accessToken: string): Promise<ProfileSetupStatus> {
  const res = await fetchWebApiAuthed('/api/account/profile-setup', accessToken);
  const body = (await res.json().catch(() => ({}))) as ProfileSetupStatus & { error?: string };
  if (!res.ok) {
    throw new Error(body.error ?? 'Could not load profile setup status.');
  }
  return body;
}

export async function completeProfileSetup(args: {
  accessToken: string;
  username: string;
  referralCode?: string;
}): Promise<{ username: string; usernameChosenAt: string }> {
  const res = await fetchWebApiAuthed('/api/account/profile-setup', args.accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: args.username,
      ...(args.referralCode ? { referralCode: args.referralCode } : {}),
    }),
  });
  const body = (await res.json().catch(() => ({}))) as { username?: string; usernameChosenAt?: string; error?: string };
  if (!res.ok) {
    throw new Error(body.error ?? 'Could not finish profile setup.');
  }
  return {
    username: body.username ?? args.username,
    usernameChosenAt: body.usernameChosenAt ?? new Date().toISOString(),
  };
}

export async function fetchUsernameChangeStatus(accessToken: string): Promise<UsernameChangeStatus> {
  const res = await fetchWebApiAuthed('/api/account/username', accessToken);
  const body = (await res.json().catch(() => ({}))) as UsernameChangeStatus & { error?: string };
  if (!res.ok) {
    throw new Error(body.error ?? 'Could not load username settings.');
  }
  return body;
}

export async function changeUsernameViaApi(args: {
  accessToken: string;
  username: string;
}): Promise<{ username: string; usernameChosenAt: string }> {
  const res = await fetchWebApiAuthed('/api/account/username', args.accessToken, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: args.username }),
  });
  const body = (await res.json().catch(() => ({}))) as { username?: string; usernameChosenAt?: string; error?: string };
  if (!res.ok) {
    throw new Error(body.error ?? 'Could not update username.');
  }
  return {
    username: body.username ?? args.username,
    usernameChosenAt: body.usernameChosenAt ?? new Date().toISOString(),
  };
}
