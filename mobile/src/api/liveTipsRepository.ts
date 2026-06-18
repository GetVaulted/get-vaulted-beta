import { getWebApiBaseUrl } from '../lib/webApiBaseUrl';

export const LIVE_TIP_PRESET_AMOUNTS_USD = [5, 10, 20, 50] as const;
export const LIVE_TIP_MIN_USD = 1;
export const LIVE_TIP_MAX_USD = 500;

export type LiveTipSendResult =
  | { paid: true; liveTipId: string }
  | {
      requiresAction: true;
      liveTipId: string;
      clientSecret: string;
      paymentIntentId: string;
      publishableKey?: string;
    };

type TipApiPayload = {
  paid?: boolean;
  requiresAction?: boolean;
  liveTipId?: string;
  clientSecret?: string;
  paymentIntentId?: string;
  publishableKey?: string;
  error?: string;
  code?: string;
  paymentReady?: boolean;
  shippingReady?: boolean;
};

function parseTipResponse(res: Response, j: TipApiPayload): LiveTipSendResult {
  if (!res.ok) {
    throw new Error(typeof j.error === 'string' && j.error.trim() ? j.error.trim() : 'Could not send tip.');
  }
  if (j.paid && j.liveTipId) {
    return { paid: true, liveTipId: j.liveTipId };
  }
  if (j.requiresAction && j.clientSecret && j.liveTipId && j.paymentIntentId) {
    return {
      requiresAction: true,
      liveTipId: j.liveTipId,
      clientSecret: j.clientSecret,
      paymentIntentId: j.paymentIntentId,
      publishableKey: j.publishableKey,
    };
  }
  throw new Error(typeof j.error === 'string' ? j.error : 'Could not send tip.');
}

/** Charge tip with the buyer's saved Vault Wallet card for this room. */
export async function sendLiveTipWithSavedCard(
  accessToken: string,
  liveRoomId: string,
  body: { amountUsd: number; message?: string; paymentMethodId?: string },
): Promise<LiveTipSendResult> {
  const base = getWebApiBaseUrl();
  if (!base) throw new Error('Set EXPO_PUBLIC_SITE_URL to send tips.');

  const res = await fetch(`${base}/api/live-rooms/${encodeURIComponent(liveRoomId)}/tips`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });

  const j = (await res.json().catch(() => ({}))) as TipApiPayload;
  return parseTipResponse(res, j);
}

/** @deprecated Redirect checkout — prefer sendLiveTipWithSavedCard */
export async function startLiveTipCheckout(
  accessToken: string,
  liveRoomId: string,
  body: { amountUsd: number; message?: string },
): Promise<{ url: string; liveTipId: string }> {
  const base = getWebApiBaseUrl();
  if (!base) throw new Error('Set EXPO_PUBLIC_SITE_URL to send tips.');

  const res = await fetch(`${base}/api/live-rooms/${encodeURIComponent(liveRoomId)}/tips`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ ...body, useCheckout: true }),
  });

  const j = (await res.json().catch(() => ({}))) as { url?: string; liveTipId?: string; error?: string };
  if (!res.ok) {
    throw new Error(typeof j.error === 'string' && j.error.trim() ? j.error.trim() : 'Could not start tip checkout.');
  }
  if (!j.url) throw new Error('Could not start tip checkout.');
  return { url: j.url, liveTipId: j.liveTipId ?? '' };
}
