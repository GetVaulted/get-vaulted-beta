/** Client helpers for live buy-now (saved-card pipeline). */

import { loadStripe } from "@stripe/stripe-js";

export type LiveBuyNowClientResult =
  | { ok: true; paid: true; orderId?: string }
  | {
      ok: true;
      requiresAction: true;
      orderId: string;
      clientSecret: string;
      paymentIntentId: string;
      publishableKey?: string;
    }
  | { ok: true; processing: true; orderId: string }
  | { ok: false; error: string; status: number; signInUrl?: string; walletIncomplete?: boolean; paymentFailed?: boolean; code?: string; orderId?: string };

export async function purchaseLiveBuyNow(args: {
  liveRoomId: string;
  itemId: string;
  paymentMethodId?: string;
}): Promise<LiveBuyNowClientResult> {
  const res = await fetch(
    `/api/live-rooms/${encodeURIComponent(args.liveRoomId)}/items/${encodeURIComponent(args.itemId)}/buy`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ paymentMethodId: args.paymentMethodId }),
    },
  );
  const payload = (await res.json()) as {
    error?: string;
    paid?: boolean;
    ok?: boolean;
    orderId?: string;
    signInUrl?: string;
    code?: string;
    paymentFailed?: boolean;
    requiresAction?: boolean;
    clientSecret?: string;
    paymentIntentId?: string;
    publishableKey?: string;
    processing?: boolean;
  };
  if (res.status === 402 && payload.code === "LIVE_BUYER_WALLET_INCOMPLETE") {
    return { ok: false, error: payload.error ?? "Wallet incomplete.", status: 402, walletIncomplete: true };
  }
  if (res.status === 402) {
    return {
      ok: false,
      error: typeof payload.error === "string" ? payload.error : "Payment failed.",
      status: 402,
      paymentFailed: payload.paymentFailed === true,
      code: payload.code,
      orderId: payload.orderId,
    };
  }
  if (!res.ok) {
    return {
      ok: false,
      error: typeof payload.error === "string" ? payload.error : "Purchase failed.",
      status: res.status,
      signInUrl: payload.signInUrl,
    };
  }
  if (payload.paid || payload.ok) return { ok: true, paid: true, orderId: payload.orderId };
  if (payload.requiresAction && payload.clientSecret && payload.orderId && payload.paymentIntentId) {
    return {
      ok: true,
      requiresAction: true,
      orderId: payload.orderId,
      clientSecret: payload.clientSecret,
      paymentIntentId: payload.paymentIntentId,
      publishableKey: payload.publishableKey,
    };
  }
  if (payload.processing && payload.orderId) {
    return { ok: true, processing: true, orderId: payload.orderId };
  }
  return { ok: false, error: "Purchase could not complete.", status: res.status };
}

export async function syncLiveBuyNowPurchase(args: {
  liveRoomId: string;
  itemId: string;
  orderId: string;
}): Promise<LiveBuyNowClientResult> {
  const res = await fetch(
    `/api/live-rooms/${encodeURIComponent(args.liveRoomId)}/items/${encodeURIComponent(args.itemId)}/buy`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ action: "sync", orderId: args.orderId }),
    },
  );
  const payload = (await res.json()) as { error?: string; paid?: boolean; ok?: boolean; orderId?: string; paymentFailed?: boolean };
  if (res.ok && (payload.paid || payload.ok)) return { ok: true, paid: true, orderId: payload.orderId };
  return {
    ok: false,
    error: typeof payload.error === "string" ? payload.error : "Payment not completed.",
    status: res.status,
    paymentFailed: payload.paymentFailed === true,
    orderId: payload.orderId,
  };
}

export async function purchaseLiveBuyNowWithSca(args: {
  liveRoomId: string;
  itemId: string;
  paymentMethodId?: string;
}): Promise<LiveBuyNowClientResult> {
  const first = await purchaseLiveBuyNow(args);
  if (!first.ok) return first;
  if ("paid" in first && first.paid) return first;
  if (!("requiresAction" in first) || !first.requiresAction) return first;

  const pk =
    first.publishableKey?.trim() ||
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() ||
    "";
  const stripe = pk ? await loadStripe(pk) : null;
  if (!stripe) {
    return { ok: false, error: "Complete verification in Wallet, then try again.", status: 402 };
  }
  const conf = await stripe.confirmCardPayment(first.clientSecret);
  if (conf.error) {
    return { ok: false, error: conf.error.message ?? "Verification failed.", status: 402, paymentFailed: true };
  }
  return syncLiveBuyNowPurchase({
    liveRoomId: args.liveRoomId,
    itemId: args.itemId,
    orderId: first.orderId,
  });
}

export type LiveBreakSpotPayClientResult =
  | { ok: true; paid: true }
  | {
      ok: true;
      requiresAction: true;
      clientSecret: string;
      paymentIntentId: string;
      publishableKey?: string;
    }
  | { ok: true; processing: true; paymentIntentId: string }
  | { ok: false; error: string; status: number; walletIncomplete?: boolean; paymentFailed?: boolean; code?: string };

export async function payLiveBreakSpot(args: {
  liveRoomId: string;
  breakSpotId: string;
  paymentMethodId?: string;
}): Promise<LiveBreakSpotPayClientResult> {
  const res = await fetch(
    `/api/live-rooms/${encodeURIComponent(args.liveRoomId)}/break-spots/${encodeURIComponent(args.breakSpotId)}/pay`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ paymentMethodId: args.paymentMethodId }),
    },
  );
  const payload = (await res.json()) as {
    error?: string;
    paid?: boolean;
    ok?: boolean;
    code?: string;
    paymentFailed?: boolean;
    requiresAction?: boolean;
    clientSecret?: string;
    paymentIntentId?: string;
    publishableKey?: string;
    processing?: boolean;
  };
  if (res.status === 402 && payload.code === "LIVE_BUYER_WALLET_INCOMPLETE") {
    return { ok: false, error: payload.error ?? "Wallet incomplete.", status: 402, walletIncomplete: true };
  }
  if (res.status === 402) {
    return {
      ok: false,
      error: typeof payload.error === "string" ? payload.error : "Payment failed.",
      status: 402,
      paymentFailed: payload.paymentFailed === true,
      code: payload.code,
    };
  }
  if (!res.ok) {
    return { ok: false, error: typeof payload.error === "string" ? payload.error : "Payment failed.", status: res.status };
  }
  if (payload.paid || payload.ok) return { ok: true, paid: true };
  if (payload.requiresAction && payload.clientSecret && payload.paymentIntentId) {
    return {
      ok: true,
      requiresAction: true,
      clientSecret: payload.clientSecret,
      paymentIntentId: payload.paymentIntentId,
      publishableKey: payload.publishableKey,
    };
  }
  if (payload.processing && payload.paymentIntentId) {
    return { ok: true, processing: true, paymentIntentId: payload.paymentIntentId };
  }
  return { ok: false, error: "Payment could not complete.", status: res.status };
}

export async function syncLiveBreakSpotPay(args: {
  liveRoomId: string;
  breakSpotId: string;
}): Promise<LiveBreakSpotPayClientResult> {
  const res = await fetch(
    `/api/live-rooms/${encodeURIComponent(args.liveRoomId)}/break-spots/${encodeURIComponent(args.breakSpotId)}/pay`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ action: "sync" }),
    },
  );
  const payload = (await res.json()) as { error?: string; paid?: boolean; ok?: boolean; paymentFailed?: boolean };
  if (res.ok && (payload.paid || payload.ok)) return { ok: true, paid: true };
  return {
    ok: false,
    error: typeof payload.error === "string" ? payload.error : "Payment not completed.",
    status: res.status,
    paymentFailed: payload.paymentFailed === true,
  };
}

export async function payLiveBreakSpotWithSca(args: {
  liveRoomId: string;
  breakSpotId: string;
}): Promise<LiveBreakSpotPayClientResult> {
  const first = await payLiveBreakSpot(args);
  if (!first.ok) return first;
  if ("paid" in first && first.paid) return first;
  if (!("requiresAction" in first) || !first.requiresAction) return first;

  const pk =
    first.publishableKey?.trim() ||
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() ||
    "";
  const stripe = pk ? await loadStripe(pk) : null;
  if (!stripe) {
    return { ok: false, error: "Complete verification in Wallet, then try again.", status: 402 };
  }
  const conf = await stripe.confirmCardPayment(first.clientSecret);
  if (conf.error) {
    return { ok: false, error: conf.error.message ?? "Verification failed.", status: 402, paymentFailed: true };
  }
  return syncLiveBreakSpotPay({ liveRoomId: args.liveRoomId, breakSpotId: args.breakSpotId });
}
