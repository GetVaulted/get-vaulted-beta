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
};

function parseTipResponse(res: Response, j: TipApiPayload): LiveTipSendResult {
  if (!res.ok) {
    throw new Error(typeof j.error === "string" && j.error.trim() ? j.error.trim() : "Could not send tip.");
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
  throw new Error(typeof j.error === "string" ? j.error : "Could not send tip.");
}

export async function sendLiveTipWithSavedCard(
  liveRoomId: string,
  body: { amountUsd: number; message?: string; paymentMethodId?: string },
): Promise<LiveTipSendResult> {
  const res = await fetch(`/api/live-rooms/${encodeURIComponent(liveRoomId)}/tips`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  const j = (await res.json().catch(() => ({}))) as TipApiPayload;
  return parseTipResponse(res, j);
}

/** @deprecated Redirect checkout — prefer sendLiveTipWithSavedCard */
export async function startLiveTipCheckout(
  liveRoomId: string,
  body: { amountUsd: number; message?: string },
): Promise<{ url: string; liveTipId: string }> {
  const res = await fetch(`/api/live-rooms/${encodeURIComponent(liveRoomId)}/tips`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ ...body, useCheckout: true }),
  });
  const j = (await res.json().catch(() => ({}))) as { url?: string; liveTipId?: string; error?: string };
  if (!res.ok) {
    throw new Error(typeof j.error === "string" && j.error.trim() ? j.error.trim() : "Could not start tip checkout.");
  }
  if (!j.url) throw new Error("Could not start tip checkout.");
  return { url: j.url, liveTipId: j.liveTipId ?? "" };
}

export type LiveTipPaymentMethodRow = {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  isDefault: boolean;
};

export async function fetchLiveBuyerPaymentSession(liveRoomId: string): Promise<{
  activePaymentMethodId: string | null;
  liveRoomPaymentReady: boolean;
} | null> {
  const res = await fetch(`/api/live-rooms/${encodeURIComponent(liveRoomId)}/buyer-payment`, {
    credentials: "include",
    cache: "no-store",
  });
  const j = (await res.json().catch(() => ({}))) as {
    payment?: { activePaymentMethodId: string | null; liveRoomPaymentReady: boolean };
  };
  if (!res.ok) return null;
  return j.payment ?? null;
}

export async function fetchLiveTipPaymentMethods(): Promise<LiveTipPaymentMethodRow[]> {
  const res = await fetch("/api/account/payment-methods", { credentials: "include", cache: "no-store" });
  const j = (await res.json().catch(() => ({}))) as { paymentMethods?: LiveTipPaymentMethodRow[] };
  if (!res.ok) return [];
  return Array.isArray(j.paymentMethods) ? j.paymentMethods : [];
}

export async function setLiveBuyerPaymentMethod(
  liveRoomId: string,
  paymentMethodId: string,
): Promise<{ activePaymentMethodId: string | null; liveRoomPaymentReady: boolean } | null> {
  const res = await fetch(`/api/live-rooms/${encodeURIComponent(liveRoomId)}/buyer-payment`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paymentMethodId }),
  });
  const j = (await res.json().catch(() => ({}))) as {
    payment?: { activePaymentMethodId: string | null; liveRoomPaymentReady: boolean };
    error?: string;
  };
  if (!res.ok) {
    throw new Error(typeof j.error === "string" ? j.error : "Could not update payment method.");
  }
  return j.payment ?? null;
}

export function formatLiveTipPaymentMethodLabel(
  methods: LiveTipPaymentMethodRow[],
  paymentMethodId: string | null | undefined,
): string {
  if (!paymentMethodId?.trim()) return "Vault Wallet card";
  const pm = methods.find((m) => m.id === paymentMethodId);
  if (!pm) return "Saved card";
  const brand = pm.brand.trim() || "Card";
  return `${brand} ···· ${pm.last4}`;
}
