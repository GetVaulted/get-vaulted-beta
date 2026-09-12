/**
 * Buyer PayPal Wallet vault + charge via PayPal Payment Method Tokens / Orders APIs.
 * Mirrors Venmo (`paypal-buyer-venmo.ts`) for live off-session settlement on the PAYPAL_VENMO rail.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import {
  getPayPalAccessToken,
  paypalApiBase,
  isBuyerPayPalWalletConfigured,
} from "@/lib/paypal-auth";
import {
  parsePayPalErrorBody,
  VenmoSetupError,
  venmoCheckoutUrlForOrder,
} from "@/lib/paypal-buyer-venmo";
import type { BuyerWalletPaymentMethodDTO } from "@/lib/payment-processor";

export const PAYPAL_WALLET_PM_PREFIX = "paypal_";

export { isBuyerPayPalWalletConfigured };

export function isPayPalWalletPaymentMethodId(id: string | null | undefined): boolean {
  const t = id?.trim() ?? "";
  return t.startsWith(PAYPAL_WALLET_PM_PREFIX) && t.length > PAYPAL_WALLET_PM_PREFIX.length;
}

export function paypalWalletPaymentMethodId(paymentTokenId: string): string {
  return `${PAYPAL_WALLET_PM_PREFIX}${paymentTokenId.trim()}`;
}

export function paypalPaymentTokenIdFromWalletPmId(walletPmId: string): string | null {
  if (!isPayPalWalletPaymentMethodId(walletPmId)) return null;
  return walletPmId.trim().slice(PAYPAL_WALLET_PM_PREFIX.length);
}

function siteOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

function paypalCallbackSigningSecret(): string {
  return (
    process.env.PAYPAL_BUYER_VENMO_STATE_SECRET?.trim() ||
    process.env.PAYPAL_CLIENT_SECRET?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim() ||
    "dev-paypal-wallet-state"
  );
}

export function signPayPalWalletSetupState(args: { userId: string; nonce: string }): string {
  const payload = `paypal.${args.userId}.${args.nonce}`;
  return createHmac("sha256", paypalCallbackSigningSecret()).update(payload).digest("hex");
}

export function verifyPayPalWalletSetupState(args: {
  userId: string;
  nonce: string;
  sig: string;
}): boolean {
  const expected = signPayPalWalletSetupState({ userId: args.userId, nonce: args.nonce });
  const a = Buffer.from(expected);
  const b = Buffer.from(args.sig.trim());
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function paypalWalletLinkVerificationAmountUsd(): number {
  const raw = Number(process.env.PAYPAL_WALLET_VERIFY_AMOUNT_USD ?? process.env.PAYPAL_VENMO_VERIFY_AMOUNT_USD ?? "1");
  if (!Number.isFinite(raw) || raw < 0.01) return 1;
  return Math.round(raw * 100) / 100;
}

type PayPalLink = { href?: string; rel?: string; method?: string };

function approveHrefFromLinks(links: PayPalLink[] | undefined): string | null {
  const approve = links?.find((l) => {
    const rel = (l.rel ?? "").toLowerCase();
    return rel === "approve" || rel === "payer-action" || rel === "payer_action";
  });
  const href = approve?.href?.trim();
  return href || null;
}

async function refundPayPalCapture(accessToken: string, captureId: string): Promise<void> {
  try {
    await fetch(`${paypalApiBase()}/v2/payments/captures/${encodeURIComponent(captureId)}/refund`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: "{}",
    });
  } catch (e) {
    console.warn("[paypal-wallet] refund verification capture failed", e);
  }
}

async function voidPayPalAuthorization(accessToken: string, authorizationId: string): Promise<void> {
  try {
    await fetch(
      `${paypalApiBase()}/v2/payments/authorizations/${encodeURIComponent(authorizationId)}/void`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: "{}",
      },
    );
  } catch (e) {
    console.warn("[paypal-wallet] void verification auth failed", e);
  }
}

/**
 * Start PayPal Wallet linking via Orders API (save-during-purchase).
 * $1 CAPTURE then refunded — same vault-during-purchase pattern as Venmo.
 */
export async function createBuyerPayPalWalletSetupAuthorization(args: {
  userId: string;
  mobileReturn?: boolean;
}): Promise<{ authorizeUrl: string; setupTokenId: string }> {
  if (!isBuyerPayPalWalletConfigured()) {
    throw new Error("PAYPAL_WALLET_NOT_CONFIGURED");
  }

  const user = await prisma.user.findUnique({
    where: { id: args.userId },
    select: { id: true, email: true, paypalBuyerCustomerId: true },
  });
  if (!user) throw new Error("USER_NOT_FOUND");

  const nonce = createHmac("sha256", `${user.id}:paypal:${Date.now()}`)
    .update(paypalCallbackSigningSecret())
    .digest("hex")
    .slice(0, 32);
  const sig = signPayPalWalletSetupState({ userId: user.id, nonce });
  const returnUrl = new URL(`${siteOrigin()}/api/account/payment-methods/paypal-callback`);
  returnUrl.searchParams.set("uid", user.id);
  returnUrl.searchParams.set("nonce", nonce);
  returnUrl.searchParams.set("sig", sig);
  if (args.mobileReturn) returnUrl.searchParams.set("mobile", "1");

  const cancelUrl = `${siteOrigin()}/account/payment-methods?paypal=cancelled${
    args.mobileReturn ? "&mobile=1" : ""
  }`;

  const amount = paypalWalletLinkVerificationAmountUsd().toFixed(2);
  const token = await getPayPalAccessToken();
  const requestId = `gv-paypal-link-${user.id}-${Date.now()}`.slice(0, 64);

  const vault: Record<string, unknown> = {
    store_in_vault: "ON_SUCCESS",
    usage_type: "MERCHANT",
    customer_type: "CONSUMER",
    permit_multiple_payment_tokens: false,
  };

  const body = {
    intent: "CAPTURE",
    purchase_units: [
      {
        amount: { currency_code: "USD", value: amount },
        description: "Get Vaulted PayPal verification (refunded)",
      },
    ],
    payment_source: {
      paypal: {
        experience_context: {
          brand_name: "Get Vaulted",
          shipping_preference: "NO_SHIPPING",
          user_action: "PAY_NOW",
          return_url: returnUrl.toString(),
          cancel_url: cancelUrl,
        },
        attributes: {
          ...(user.paypalBuyerCustomerId?.trim()
            ? { customer: { id: user.paypalBuyerCustomerId.trim() } }
            : {}),
          vault,
        },
      },
    },
  };

  const res = await fetch(`${paypalApiBase()}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": requestId,
      Prefer: "return=representation",
    },
    body: JSON.stringify(body),
  });
  const rawText = await res.text();
  let json: { id?: string; status?: string; links?: PayPalLink[] } = {};
  try {
    json = JSON.parse(rawText) as typeof json;
  } catch {
    /* empty */
  }
  if (!res.ok) {
    const parsed = parsePayPalErrorBody(rawText);
    console.error("[paypal-wallet-setup] create order failed", {
      status: res.status,
      issue: parsed.issue,
      debugId: parsed.debugId,
      body: rawText.slice(0, 400),
    });
    throw new VenmoSetupError({
      code: "PAYPAL_WALLET_SETUP_FAILED",
      issue: parsed.issue,
      debugId: parsed.debugId,
      httpStatus: res.status,
      userMessage:
        parsed.message ||
        (parsed.issue
          ? `PayPal rejected PayPal Wallet linking (${parsed.issue}).`
          : "PayPal rejected PayPal Wallet linking."),
    });
  }

  const orderId = json.id?.trim() ?? "";
  if (!orderId) {
    throw new VenmoSetupError({
      code: "PAYPAL_WALLET_SETUP_FAILED",
      userMessage: "PayPal did not return an order id for PayPal Wallet linking.",
    });
  }

  const authorizeUrl = approveHrefFromLinks(json.links) || venmoCheckoutUrlForOrder(orderId);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      paypalPendingSetupTokenId: orderId,
      paypalPendingSetupNonce: nonce,
      paypalPendingSetupMobile: Boolean(args.mobileReturn),
    },
  });

  return { authorizeUrl, setupTokenId: orderId };
}

type PayPalOrderJson = {
  id?: string;
  status?: string;
  payment_source?: {
    paypal?: {
      email_address?: string;
      attributes?: { vault?: { id?: string; customer?: { id?: string } } };
      attribute?: { vault?: { id?: string; customer?: { id?: string } } };
    };
  };
  purchase_units?: Array<{
    payments?: {
      captures?: Array<{ id?: string; status?: string }>;
      authorizations?: Array<{ id?: string; status?: string }>;
    };
  }>;
};

function extractPayPalVault(json: PayPalOrderJson): {
  vaultId: string | null;
  customerId: string | null;
  email: string | null;
  captureId: string | null;
  authorizationId: string | null;
} {
  const src = json.payment_source?.paypal;
  const vault = src?.attributes?.vault ?? src?.attribute?.vault;
  return {
    vaultId: vault?.id?.trim() || null,
    customerId: vault?.customer?.id?.trim() || null,
    email: src?.email_address?.trim() || null,
    captureId: json.purchase_units?.[0]?.payments?.captures?.[0]?.id?.trim() || null,
    authorizationId: json.purchase_units?.[0]?.payments?.authorizations?.[0]?.id?.trim() || null,
  };
}

export async function completeBuyerPayPalWalletSetupFromToken(args: {
  userId: string;
  setupTokenId: string;
}): Promise<{ paymentMethodId: string; email: string | null }> {
  const user = await prisma.user.findUnique({
    where: { id: args.userId },
    select: { id: true, paypalBuyerCustomerId: true },
  });
  if (!user) throw new Error("USER_NOT_FOUND");

  const orderId = args.setupTokenId.trim();
  const accessToken = await getPayPalAccessToken();
  const requestId = `gv-paypal-vault-${user.id}-${orderId}`.slice(0, 64);

  const capRes = await fetch(`${paypalApiBase()}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": requestId,
      Prefer: "return=representation",
    },
    body: "{}",
  });
  const rawText = await capRes.text();
  let json: PayPalOrderJson = {};
  try {
    json = JSON.parse(rawText) as PayPalOrderJson;
  } catch {
    /* empty */
  }

  if (!capRes.ok) {
    const getRes = await fetch(`${paypalApiBase()}/v2/checkout/orders/${encodeURIComponent(orderId)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const getText = await getRes.text();
    try {
      json = JSON.parse(getText) as PayPalOrderJson;
    } catch {
      /* empty */
    }
    const st = (json.status ?? "").toUpperCase();
    if (!getRes.ok || st !== "COMPLETED") {
      const parsed = parsePayPalErrorBody(rawText || getText);
      throw new VenmoSetupError({
        code: "PAYPAL_WALLET_VAULT_FAILED",
        issue: parsed.issue,
        debugId: parsed.debugId,
        userMessage:
          parsed.message ||
          "Could not finish PayPal linking after approval. Try Connect PayPal again.",
        cause: (rawText || getText).slice(0, 400),
      });
    }
  }

  let { vaultId, customerId, email, captureId, authorizationId } = extractPayPalVault(json);
  if (!vaultId) {
    for (let i = 0; i < 3 && !vaultId; i++) {
      await new Promise((r) => setTimeout(r, 800));
      const getRes = await fetch(`${paypalApiBase()}/v2/checkout/orders/${encodeURIComponent(orderId)}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const getText = await getRes.text();
      try {
        json = JSON.parse(getText) as PayPalOrderJson;
      } catch {
        continue;
      }
      ({ vaultId, customerId, email, captureId, authorizationId } = extractPayPalVault(json));
    }
  }

  if (captureId) {
    await refundPayPalCapture(accessToken, captureId);
  } else if (authorizationId) {
    await voidPayPalAuthorization(accessToken, authorizationId);
  }

  if (!vaultId) {
    throw new VenmoSetupError({
      code: "PAYPAL_WALLET_VAULT_FAILED",
      userMessage:
        "PayPal approved but did not return a saved vault id yet. Confirm Account Settings → Payment preferences → Save PayPal and Venmo is enabled, then try again.",
    });
  }

  const paymentMethodId = paypalWalletPaymentMethodId(vaultId);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      paypalWalletPaymentTokenId: vaultId,
      paypalWalletEmail: email,
      paypalWalletVaultedAt: new Date(),
      paypalBuyerCustomerId: customerId || user.paypalBuyerCustomerId,
      buyerDefaultWalletPaymentMethodId: paymentMethodId,
      paypalPendingSetupTokenId: null,
      paypalPendingSetupNonce: null,
      paypalPendingSetupMobile: false,
    },
  });

  return { paymentMethodId, email };
}

export async function getBuyerPayPalWalletMethod(
  userId: string,
): Promise<BuyerWalletPaymentMethodDTO | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      paypalWalletPaymentTokenId: true,
      paypalWalletEmail: true,
      buyerDefaultWalletPaymentMethodId: true,
    },
  });
  const tokenId = user?.paypalWalletPaymentTokenId?.trim();
  if (!tokenId) return null;
  const id = paypalWalletPaymentMethodId(tokenId);
  const last4 = (user?.paypalWalletEmail ?? tokenId).replace(/[^a-zA-Z0-9]/g, "").slice(-4) || "····";
  return {
    id,
    type: "paypal",
    brand: "PayPal",
    last4,
    expMonth: 0,
    expYear: 0,
    isDefault: user?.buyerDefaultWalletPaymentMethodId === id,
  };
}

export async function buyerHasPayPalWalletOnFile(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { paypalWalletPaymentTokenId: true },
  });
  return Boolean(user?.paypalWalletPaymentTokenId?.trim());
}

export async function setBuyerPayPalWalletAsDefault(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { paypalWalletPaymentTokenId: true },
  });
  const tokenId = user?.paypalWalletPaymentTokenId?.trim();
  if (!tokenId) throw new Error("PAYPAL_WALLET_NOT_LINKED");
  await prisma.user.update({
    where: { id: userId },
    data: { buyerDefaultWalletPaymentMethodId: paypalWalletPaymentMethodId(tokenId) },
  });
}

export async function detachBuyerPayPalWallet(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { paypalWalletPaymentTokenId: true, buyerDefaultWalletPaymentMethodId: true },
  });
  const tokenId = user?.paypalWalletPaymentTokenId?.trim();
  if (!tokenId) throw new Error("PAYPAL_WALLET_NOT_LINKED");

  if (isBuyerPayPalWalletConfigured()) {
    try {
      const accessToken = await getPayPalAccessToken();
      await fetch(`${paypalApiBase()}/v3/vault/payment-tokens/${encodeURIComponent(tokenId)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    } catch (e) {
      console.warn("[paypal-wallet] could not delete PayPal payment token", e);
    }
  }

  const defaultId = user?.buyerDefaultWalletPaymentMethodId?.trim() ?? "";
  await prisma.user.update({
    where: { id: userId },
    data: {
      paypalWalletPaymentTokenId: null,
      paypalWalletEmail: null,
      paypalWalletVaultedAt: null,
      buyerDefaultWalletPaymentMethodId: isPayPalWalletPaymentMethodId(defaultId) ? null : defaultId || null,
    },
  });
}

export type ChargePayPalWalletOrderResult =
  | { outcome: "paid"; processorPaymentId: string }
  | { outcome: "error"; code: string; message?: string };

/** Capture an order with a vaulted PayPal Wallet payment token (off-session / MIT). */
export async function chargeOrderWithVaultedPayPalWallet(args: {
  buyerId: string;
  orderId: string;
  amountUsd: number;
  description?: string;
}): Promise<ChargePayPalWalletOrderResult> {
  if (!isBuyerPayPalWalletConfigured()) {
    return { outcome: "error", code: "PAYPAL_WALLET_NOT_CONFIGURED" };
  }
  const amount = Math.round(args.amountUsd * 100) / 100;
  if (amount < 0.01) return { outcome: "error", code: "INVALID_ORDER_AMOUNT" };

  const user = await prisma.user.findUnique({
    where: { id: args.buyerId },
    select: { paypalWalletPaymentTokenId: true, paypalBuyerCustomerId: true },
  });
  const vaultId = user?.paypalWalletPaymentTokenId?.trim();
  if (!vaultId) return { outcome: "error", code: "PAYPAL_WALLET_NOT_LINKED" };

  const accessToken = await getPayPalAccessToken();
  const requestId = `gv-paypal-charge-${args.orderId}`.slice(0, 64);
  const res = await fetch(`${paypalApiBase()}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": requestId,
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: args.orderId.slice(0, 127),
          custom_id: args.orderId.slice(0, 127),
          description: (args.description ?? `Get Vaulted order ${args.orderId}`).slice(0, 127),
          amount: {
            currency_code: "USD",
            value: amount.toFixed(2),
          },
        },
      ],
      payment_source: {
        paypal: {
          vault_id: vaultId,
          experience_context: {
            brand_name: "Get Vaulted",
            shipping_preference: "NO_SHIPPING",
          },
        },
      },
    }),
  });
  const rawText = await res.text();
  let json: {
    id?: string;
    status?: string;
    purchase_units?: Array<{ payments?: { captures?: Array<{ id?: string; status?: string }> } }>;
  } = {};
  try {
    json = JSON.parse(rawText) as typeof json;
  } catch {
    /* empty */
  }
  if (!res.ok) {
    return {
      outcome: "error",
      code: "PAYPAL_WALLET_CHARGE_FAILED",
      message: rawText.slice(0, 300),
    };
  }

  const status = (json.status ?? "").toUpperCase();
  const captureId =
    json.purchase_units?.[0]?.payments?.captures?.[0]?.id?.trim() || json.id?.trim() || "";
  if (status === "COMPLETED" || status === "APPROVED") {
    if (status === "APPROVED" && json.id) {
      const capRes = await fetch(`${paypalApiBase()}/v2/checkout/orders/${encodeURIComponent(json.id)}/capture`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "PayPal-Request-Id": `${requestId}-cap`,
          Prefer: "return=representation",
        },
        body: "{}",
      });
      const capText = await capRes.text();
      let capJson: typeof json = {};
      try {
        capJson = JSON.parse(capText) as typeof json;
      } catch {
        /* empty */
      }
      if (!capRes.ok || (capJson.status ?? "").toUpperCase() !== "COMPLETED") {
        return {
          outcome: "error",
          code: "PAYPAL_WALLET_CAPTURE_FAILED",
          message: capText.slice(0, 300),
        };
      }
      const paidId =
        capJson.purchase_units?.[0]?.payments?.captures?.[0]?.id?.trim() ||
        capJson.id?.trim() ||
        captureId;
      return { outcome: "paid", processorPaymentId: paidId };
    }
    if (!captureId) {
      return { outcome: "error", code: "PAYPAL_WALLET_CHARGE_MISSING_ID" };
    }
    return { outcome: "paid", processorPaymentId: captureId };
  }

  return {
    outcome: "error",
    code: `PAYPAL_WALLET_CHARGE_STATUS_${status || "UNKNOWN"}`,
    message: rawText.slice(0, 300),
  };
}
