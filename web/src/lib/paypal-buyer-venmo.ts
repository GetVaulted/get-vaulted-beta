/**
 * Buyer Venmo vault + charge via PayPal Payment Method Tokens / Orders APIs.
 * Stripe does not offer Venmo for saved off-session live charges — this is the PAYPAL_VENMO rail.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getPayPalAccessToken, paypalApiBase, isBuyerVenmoPayConfigured } from "@/lib/paypal-auth";
import type { BuyerWalletPaymentMethodDTO } from "@/lib/payment-processor";

export const VENMO_WALLET_PM_PREFIX = "venmo_";

export { isBuyerVenmoPayConfigured };

export function isVenmoWalletPaymentMethodId(id: string | null | undefined): boolean {
  const t = id?.trim() ?? "";
  return t.startsWith(VENMO_WALLET_PM_PREFIX) && t.length > VENMO_WALLET_PM_PREFIX.length;
}

export function venmoWalletPaymentMethodId(paymentTokenId: string): string {
  return `${VENMO_WALLET_PM_PREFIX}${paymentTokenId.trim()}`;
}

export function venmoPaymentTokenIdFromWalletPmId(walletPmId: string): string | null {
  if (!isVenmoWalletPaymentMethodId(walletPmId)) return null;
  return walletPmId.trim().slice(VENMO_WALLET_PM_PREFIX.length);
}

function siteOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

function venmoCallbackSigningSecret(): string {
  return (
    process.env.PAYPAL_BUYER_VENMO_STATE_SECRET?.trim() ||
    process.env.PAYPAL_CLIENT_SECRET?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim() ||
    "dev-venmo-state"
  );
}

export function signVenmoSetupState(args: { userId: string; nonce: string }): string {
  const payload = `${args.userId}.${args.nonce}`;
  return createHmac("sha256", venmoCallbackSigningSecret()).update(payload).digest("hex");
}

export function verifyVenmoSetupState(args: {
  userId: string;
  nonce: string;
  sig: string;
}): boolean {
  const expected = signVenmoSetupState({ userId: args.userId, nonce: args.nonce });
  const a = Buffer.from(expected);
  const b = Buffer.from(args.sig.trim());
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

type PayPalLink = { href?: string; rel?: string; method?: string };

function paypalCheckoutHost(): string {
  const mode = (process.env.PAYPAL_MODE ?? "sandbox").toLowerCase();
  return mode === "live" ? "https://www.paypal.com" : "https://www.sandbox.paypal.com";
}

function approveHrefFromLinks(links: PayPalLink[] | undefined): string | null {
  const approve = links?.find((l) => {
    const rel = (l.rel ?? "").toLowerCase();
    return rel === "approve" || rel === "payer-action" || rel === "payer_action";
  });
  const href = approve?.href?.trim();
  return href || null;
}

/** When PayPal omits payer-action (common for Venmo), send the buyer to Checkout with the order token. */
export function venmoCheckoutUrlForOrder(orderId: string): string {
  return `${paypalCheckoutHost()}/checkoutnow?token=${encodeURIComponent(orderId.trim())}`;
}

export class VenmoSetupError extends Error {
  readonly code: string;
  readonly issue: string | null;
  readonly debugId: string | null;
  readonly httpStatus: number | null;
  readonly userMessage: string;

  constructor(args: {
    code: string;
    userMessage: string;
    issue?: string | null;
    debugId?: string | null;
    httpStatus?: number | null;
    cause?: unknown;
  }) {
    super(args.userMessage);
    this.name = "VenmoSetupError";
    this.code = args.code;
    this.issue = args.issue ?? null;
    this.debugId = args.debugId ?? null;
    this.httpStatus = args.httpStatus ?? null;
    if (args.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = args.cause;
    }
  }
}

export function parsePayPalErrorBody(rawText: string): {
  issue: string | null;
  debugId: string | null;
  message: string | null;
  field: string | null;
} {
  try {
    const json = JSON.parse(rawText) as {
      name?: string;
      message?: string;
      debug_id?: string;
      details?: Array<{ issue?: string; description?: string; field?: string; value?: string }>;
    };
    const detail = json.details?.[0];
    const issue = detail?.issue?.trim() || json.name?.trim() || null;
    const field = detail?.field?.trim() || null;
    const description = detail?.description?.trim() || json.message?.trim() || null;
    return {
      issue,
      debugId: json.debug_id?.trim() || null,
      message: field ? `${description || issue || "Invalid parameter"} (${field})` : description,
      field,
    };
  } catch {
    return { issue: null, debugId: null, message: null, field: null };
  }
}

/** Venmo only supports vaulting during a purchase — we charge then refund this amount. */
export function venmoLinkVerificationAmountUsd(): number {
  const raw = Number(process.env.PAYPAL_VENMO_VERIFY_AMOUNT_USD ?? "1");
  if (!Number.isFinite(raw) || raw < 0.01) return 1;
  return Math.round(raw * 100) / 100;
}

/**
 * Start Venmo linking via Orders API (save-during-purchase).
 * PayPal does not support Venmo on setup-tokens / purchase-later.
 */
export async function createBuyerVenmoSetupAuthorization(args: {
  userId: string;
  /** When true, callback redirects to the mobile app scheme after vaulting. */
  mobileReturn?: boolean;
}): Promise<{ authorizeUrl: string; setupTokenId: string }> {
  if (!isBuyerVenmoPayConfigured()) {
    throw new Error("VENMO_NOT_CONFIGURED");
  }

  const user = await prisma.user.findUnique({
    where: { id: args.userId },
    select: { id: true, email: true, paypalBuyerCustomerId: true },
  });
  if (!user) throw new Error("USER_NOT_FOUND");

  const nonce = createHmac("sha256", `${user.id}:${Date.now()}`)
    .update(venmoCallbackSigningSecret())
    .digest("hex")
    .slice(0, 32);
  const sig = signVenmoSetupState({ userId: user.id, nonce });
  const returnUrl = new URL(`${siteOrigin()}/api/account/payment-methods/venmo-callback`);
  returnUrl.searchParams.set("uid", user.id);
  returnUrl.searchParams.set("nonce", nonce);
  returnUrl.searchParams.set("sig", sig);
  if (args.mobileReturn) returnUrl.searchParams.set("mobile", "1");

  const cancelUrl = `${siteOrigin()}/account/payment-methods?venmo=cancelled${
    args.mobileReturn ? "&mobile=1" : ""
  }`;

  const amount = venmoLinkVerificationAmountUsd().toFixed(2);
  const token = await getPayPalAccessToken();
  const requestId = `gv-venmo-link-${user.id}-${Date.now()}`.slice(0, 64);

  // Match PayPal's documented Venmo + vault-during-purchase shape.
  // Extra fields (usage_pattern, top-level application_context, AUTHORIZE) cause
  // INCOMPATIBLE_PARAMETER_VALUE on many merchant accounts.
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
        description: "Get Vaulted Venmo verification (refunded)",
      },
    ],
    payment_source: {
      venmo: {
        experience_context: {
          brand_name: "Get Vaulted",
          shipping_preference: "NO_SHIPPING",
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
  let json: {
    id?: string;
    status?: string;
    links?: PayPalLink[];
  } = {};
  try {
    json = JSON.parse(rawText) as typeof json;
  } catch {
    /* empty */
  }
  if (!res.ok) {
    const parsed = parsePayPalErrorBody(rawText);
    console.error("[venmo-setup] create order failed", {
      status: res.status,
      issue: parsed.issue,
      field: parsed.field,
      debugId: parsed.debugId,
      body: rawText.slice(0, 500),
    });
    throw new VenmoSetupError({
      code: "VENMO_SETUP_FAILED",
      httpStatus: res.status,
      issue: parsed.issue,
      debugId: parsed.debugId,
      userMessage:
        parsed.message ||
        (parsed.issue ? `PayPal rejected Venmo linking (${parsed.issue}).` : "PayPal rejected Venmo linking."),
      cause: rawText.slice(0, 400),
    });
  }
  const orderId = json.id?.trim();
  if (!orderId) {
    throw new VenmoSetupError({
      code: "VENMO_SETUP_FAILED",
      userMessage: "PayPal did not return an order id for Venmo linking.",
    });
  }

  const authorizeUrl = approveHrefFromLinks(json.links) || venmoCheckoutUrlForOrder(orderId);
  console.info("[venmo-setup] order created", {
    orderId,
    status: json.status ?? null,
    linkRels: (json.links ?? []).map((l) => l.rel ?? ""),
    authorizeHost: (() => {
      try {
        return new URL(authorizeUrl).host;
      } catch {
        return "invalid";
      }
    })(),
  });

  await prisma.user.update({
    where: { id: user.id },
    data: {
      venmoPendingSetupTokenId: orderId,
      venmoPendingSetupNonce: nonce,
      venmoPendingSetupMobile: Boolean(args.mobileReturn),
    },
  });

  return { authorizeUrl, setupTokenId: orderId };
}

type VenmoOrderJson = {
  id?: string;
  status?: string;
  payment_source?: {
    venmo?: {
      user_name?: string;
      attributes?: { vault?: { id?: string; status?: string; customer?: { id?: string } } };
      attribute?: { vault?: { id?: string; status?: string; customer?: { id?: string } } };
    };
  };
  purchase_units?: Array<{
    payments?: {
      captures?: Array<{ id?: string; status?: string }>;
      authorizations?: Array<{ id?: string; status?: string }>;
    };
  }>;
};

function extractVenmoVault(json: VenmoOrderJson): {
  vaultId: string | null;
  customerId: string | null;
  username: string | null;
  captureId: string | null;
  authorizationId: string | null;
} {
  const venmo = json.payment_source?.venmo;
  const vault = venmo?.attributes?.vault ?? venmo?.attribute?.vault;
  return {
    vaultId: vault?.id?.trim() || null,
    customerId: vault?.customer?.id?.trim() || null,
    username: venmo?.user_name?.trim() || null,
    captureId: json.purchase_units?.[0]?.payments?.captures?.[0]?.id?.trim() || null,
    authorizationId: json.purchase_units?.[0]?.payments?.authorizations?.[0]?.id?.trim() || null,
  };
}

async function refundPayPalCapture(accessToken: string, captureId: string): Promise<void> {
  const res = await fetch(`${paypalApiBase()}/v2/payments/captures/${encodeURIComponent(captureId)}/refund`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": `gv-venmo-refund-${captureId}`.slice(0, 64),
    },
    body: "{}",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.warn("[venmo] verification refund failed", { captureId, status: res.status, body: text.slice(0, 300) });
  }
}

async function voidPayPalAuthorization(accessToken: string, authorizationId: string): Promise<void> {
  const res = await fetch(
    `${paypalApiBase()}/v2/payments/authorizations/${encodeURIComponent(authorizationId)}/void`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "PayPal-Request-Id": `gv-venmo-void-${authorizationId}`.slice(0, 64),
      },
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.warn("[venmo] verification void failed", {
      authorizationId,
      status: res.status,
      body: text.slice(0, 300),
    });
  }
}

/**
 * Finish Venmo linking after PayPal redirect — authorize verification order, store vault id, void hold.
 * `setupTokenId` is the PayPal Order id from createBuyerVenmoSetupAuthorization.
 */
export async function completeBuyerVenmoSetupFromToken(args: {
  userId: string;
  setupTokenId: string;
}): Promise<{ paymentMethodId: string; username: string | null }> {
  if (!isBuyerVenmoPayConfigured()) throw new Error("VENMO_NOT_CONFIGURED");

  const user = await prisma.user.findUnique({
    where: { id: args.userId },
    select: {
      id: true,
      venmoPendingSetupTokenId: true,
      paypalBuyerCustomerId: true,
    },
  });
  if (!user) throw new Error("USER_NOT_FOUND");

  const orderId = args.setupTokenId.trim() || user.venmoPendingSetupTokenId?.trim() || "";
  if (!orderId) throw new Error("VENMO_VAULT_FAILED:missing_order");

  const accessToken = await getPayPalAccessToken();
  const requestId = `gv-venmo-complete-${user.id}-${Date.now()}`.slice(0, 64);

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
  let json: VenmoOrderJson = {};
  try {
    json = JSON.parse(rawText) as VenmoOrderJson;
  } catch {
    /* empty */
  }

  // Idempotent: already captured → GET order
  if (!capRes.ok) {
    const getRes = await fetch(`${paypalApiBase()}/v2/checkout/orders/${encodeURIComponent(orderId)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const getText = await getRes.text();
    try {
      json = JSON.parse(getText) as VenmoOrderJson;
    } catch {
      /* empty */
    }
    const st = (json.status ?? "").toUpperCase();
    if (!getRes.ok || st !== "COMPLETED") {
      const parsed = parsePayPalErrorBody(rawText || getText);
      throw new VenmoSetupError({
        code: "VENMO_VAULT_FAILED",
        issue: parsed.issue,
        debugId: parsed.debugId,
        userMessage:
          parsed.message ||
          "Could not finish Venmo linking after approval. Try Connect Venmo again.",
        cause: (rawText || getText).slice(0, 400),
      });
    }
  }

  let { vaultId, customerId, username, captureId, authorizationId } = extractVenmoVault(json);
  if (!vaultId) {
    for (let i = 0; i < 3 && !vaultId; i++) {
      await new Promise((r) => setTimeout(r, 800));
      const getRes = await fetch(`${paypalApiBase()}/v2/checkout/orders/${encodeURIComponent(orderId)}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const getText = await getRes.text();
      try {
        json = JSON.parse(getText) as VenmoOrderJson;
      } catch {
        continue;
      }
      ({ vaultId, customerId, username, captureId, authorizationId } = extractVenmoVault(json));
    }
  }

  if (captureId) {
    await refundPayPalCapture(accessToken, captureId);
  } else if (authorizationId) {
    await voidPayPalAuthorization(accessToken, authorizationId);
  }

  if (!vaultId) {
    throw new VenmoSetupError({
      code: "VENMO_VAULT_FAILED",
      userMessage:
        "PayPal approved Venmo but did not return a saved vault id yet. Confirm Account Settings → Payment preferences → Save PayPal and Venmo is Success, then try again.",
    });
  }

  const paymentMethodId = venmoWalletPaymentMethodId(vaultId);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      venmoPaymentTokenId: vaultId,
      venmoUsername: username,
      venmoVaultedAt: new Date(),
      paypalBuyerCustomerId: customerId || user.paypalBuyerCustomerId,
      buyerDefaultWalletPaymentMethodId: paymentMethodId,
      venmoPendingSetupTokenId: null,
      venmoPendingSetupNonce: null,
      venmoPendingSetupMobile: false,
    },
  });

  return { paymentMethodId, username };
}

export async function getBuyerVenmoWalletMethod(
  userId: string,
): Promise<BuyerWalletPaymentMethodDTO | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      venmoPaymentTokenId: true,
      venmoUsername: true,
      buyerDefaultWalletPaymentMethodId: true,
    },
  });
  const tokenId = user?.venmoPaymentTokenId?.trim();
  if (!tokenId) return null;
  const id = venmoWalletPaymentMethodId(tokenId);
  const last4 = (user?.venmoUsername ?? tokenId).replace(/[^a-zA-Z0-9]/g, "").slice(-4) || "····";
  return {
    id,
    type: "venmo",
    brand: "Venmo",
    last4,
    expMonth: 0,
    expYear: 0,
    isDefault: user?.buyerDefaultWalletPaymentMethodId === id,
  };
}

export async function buyerHasVenmoOnFile(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { venmoPaymentTokenId: true },
  });
  return Boolean(user?.venmoPaymentTokenId?.trim());
}

export async function setBuyerVenmoAsDefault(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { venmoPaymentTokenId: true },
  });
  const tokenId = user?.venmoPaymentTokenId?.trim();
  if (!tokenId) throw new Error("VENMO_NOT_LINKED");
  await prisma.user.update({
    where: { id: userId },
    data: { buyerDefaultWalletPaymentMethodId: venmoWalletPaymentMethodId(tokenId) },
  });
}

export async function detachBuyerVenmo(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { venmoPaymentTokenId: true, buyerDefaultWalletPaymentMethodId: true },
  });
  const tokenId = user?.venmoPaymentTokenId?.trim();
  if (!tokenId) throw new Error("VENMO_NOT_LINKED");

  if (isBuyerVenmoPayConfigured()) {
    try {
      const accessToken = await getPayPalAccessToken();
      await fetch(`${paypalApiBase()}/v3/vault/payment-tokens/${encodeURIComponent(tokenId)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    } catch (e) {
      console.warn("[venmo] could not delete PayPal payment token", e);
    }
  }

  const defaultId = user?.buyerDefaultWalletPaymentMethodId?.trim() ?? "";
  await prisma.user.update({
    where: { id: userId },
    data: {
      venmoPaymentTokenId: null,
      venmoUsername: null,
      venmoVaultedAt: null,
      buyerDefaultWalletPaymentMethodId: isVenmoWalletPaymentMethodId(defaultId) ? null : defaultId || null,
    },
  });
}

export type ChargeVenmoOrderResult =
  | { outcome: "paid"; processorPaymentId: string }
  | { outcome: "error"; code: string; message?: string };

/** Capture an order with a vaulted Venmo payment token (off-session / MIT). */
export async function chargeOrderWithVaultedVenmo(args: {
  buyerId: string;
  orderId: string;
  amountUsd: number;
  description?: string;
}): Promise<ChargeVenmoOrderResult> {
  if (!isBuyerVenmoPayConfigured()) {
    return { outcome: "error", code: "VENMO_NOT_CONFIGURED" };
  }
  const amount = Math.round(args.amountUsd * 100) / 100;
  if (amount < 0.01) return { outcome: "error", code: "INVALID_ORDER_AMOUNT" };

  const user = await prisma.user.findUnique({
    where: { id: args.buyerId },
    select: { venmoPaymentTokenId: true, paypalBuyerCustomerId: true },
  });
  const vaultId = user?.venmoPaymentTokenId?.trim();
  if (!vaultId) return { outcome: "error", code: "VENMO_NOT_LINKED" };

  const accessToken = await getPayPalAccessToken();
  const requestId = `gv-venmo-charge-${args.orderId}`.slice(0, 64);
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
        venmo: {
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
      code: "VENMO_CHARGE_FAILED",
      message: rawText.slice(0, 300),
    };
  }

  const status = (json.status ?? "").toUpperCase();
  const captureId =
    json.purchase_units?.[0]?.payments?.captures?.[0]?.id?.trim() || json.id?.trim() || "";
  if (status === "COMPLETED" || status === "APPROVED") {
    // Some vault charges return APPROVED and need an explicit capture.
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
          code: "VENMO_CAPTURE_FAILED",
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
      return { outcome: "error", code: "VENMO_CHARGE_MISSING_ID" };
    }
    return { outcome: "paid", processorPaymentId: captureId };
  }

  return {
    outcome: "error",
    code: `VENMO_CHARGE_STATUS_${status || "UNKNOWN"}`,
    message: rawText.slice(0, 300),
  };
}
