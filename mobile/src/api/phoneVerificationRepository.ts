import { fetchWebApiAuthed } from '../lib/fetchWebApiAuthed';

export type PhoneVerificationStatus = {
  required: boolean;
  verified: boolean;
  phoneLast4: string | null;
  /** False until the SMS provider is configured on the server. */
  canSendCodes: boolean;
};

type ErrorBody = { error?: string; code?: string };

export async function fetchPhoneVerificationStatus(accessToken: string): Promise<PhoneVerificationStatus> {
  const res = await fetchWebApiAuthed('/api/account/phone/status', accessToken);
  const body = (await res.json().catch(() => ({}))) as PhoneVerificationStatus & ErrorBody;
  if (!res.ok) throw new Error(body.error ?? 'Could not load phone verification status.');
  return body;
}

export async function sendPhoneVerificationCode(accessToken: string, phone: string): Promise<{ alreadyVerified: boolean }> {
  const res = await fetchWebApiAuthed('/api/account/phone/start', accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  });
  const body = (await res.json().catch(() => ({}))) as ErrorBody & { alreadyVerified?: boolean };
  if (!res.ok) throw new Error(body.error ?? 'Could not send the code. Try again.');
  return { alreadyVerified: body.alreadyVerified === true };
}

export async function confirmPhoneVerificationCode(accessToken: string, phone: string, code: string): Promise<void> {
  const res = await fetchWebApiAuthed('/api/account/phone/check', accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, code }),
  });
  const body = (await res.json().catch(() => ({}))) as ErrorBody;
  if (!res.ok) throw new Error(body.error ?? 'Could not check the code. Try again.');
}
