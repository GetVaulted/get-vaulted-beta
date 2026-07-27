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

function approveHrefFromLinks(links: PayPalLink[] | undefined): string | null {
  const approve = links?.find((l) => (l.rel ?? "").toLowerCase() === "approve");
  const href = approve?.href?.trim();
  return href || null;
}

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

  const token = await getPayPalAccessToken();
  const requestId = `gv-venmo-setup-${user.id}-${Date.now()}`.slice(0, 64);

  const body: Record<string, unknown> = {
    payment_source: {
      venmo: {
        description: "Get Vaulted live wins & checkout",
        usage_pattern: "IMMEDIATE",
        usage_type: "MERCHANT",
        customer_type: "CONSUMER",
        experience_context: {
          brand_name: "Get Vaulted",
          shipping_preference: "NO_SHIPPING",
          return_url: returnUrl.toString(),
          cancel_url: args.mobileReturn
            ? "getvaulted://wallet?venmo=cancelled"
            : `${siteOrigin()}/account/payment-methods?venmo=cancelled`,
        },
      },
    },
  };
  if (user.paypalBuyerCustomerId?.trim()) {
    body.customer = { id: user.paypalBuyerCustomerId.trim() };
  } else {
    body.customer = { merchant_customer_id: user.id.slice(0, 64) };
  }

  const res = await fetch(`${paypalApiBase()}/v3/vault/setup-tokens`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": requestId,
    },
    body: JSON.stringify(body),
  });
  const rawText = await res.text();
  let json: {
    id?: string;
    status?: string;
    customer?: { id?: string };
    links?: PayPalLink[];
  } = {};
  try {
    json = JSON.parse(rawText) as typeof json;
  } catch {
    /* empty */
  }
  if (!res.ok) {
    throw new Error(`VENMO_SETUP_FAILED:${res.status}:${rawText.slice(0, 300)}`);
  }
  const setupTokenId = json.id?.trim();
  if (!setupTokenId) {
    throw new Error(`VENMO_SETUP_FAILED:missing_setup_token:${rawText.slice(0, 200)}`);
  }
  const authorizeUrl = approveHrefFromLinks(json.links);
  if (!authorizeUrl) {
    throw new Error("VENMO_SETUP_FAILED:missing_approve_url");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      venmoPendingSetupTokenId: setupTokenId,
      venmoPendingSetupNonce: nonce,
      venmoPendingSetupMobile: Boolean(args.mobileReturn),
      ...(json.customer?.id?.trim()
        ? { paypalBuyerCustomerId: json.customer.id.trim() }
        : {}),
    },
  });

  return { authorizeUrl, setupTokenId };
}

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

  const setupTokenId = args.setupTokenId.trim();
  if (
    user.venmoPendingSetupTokenId?.trim() &&
    user.venmoPendingSetupTokenId.trim() !== setupTokenId
  ) {
    // Allow completing the pending token or an explicitly signed token from the callback.
  }

  const accessToken = await getPayPalAccessToken();
  const requestId = `gv-venmo-vault-${user.id}-${Date.now()}`.slice(0, 64);
  const res = await fetch(`${paypalApiBase()}/v3/vault/payment-tokens`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": requestId,
    },
    body: JSON.stringify({
      payment_source: {
        token: {
          id: setupTokenId,
          type: "SETUP_TOKEN",
        },
      },
    }),
  });
  const rawText = await res.text();
  let json: {
    id?: string;
    customer?: { id?: string };
    payment_source?: { venmo?: { user_name?: string } };
  } = {};
  try {
    json = JSON.parse(rawText) as typeof json;
  } catch {
    /* empty */
  }
  if (!res.ok) {
    throw new Error(`VENMO_VAULT_FAILED:${res.status}:${rawText.slice(0, 300)}`);
  }
  const paymentTokenId = json.id?.trim();
  if (!paymentTokenId) {
    throw new Error(`VENMO_VAULT_FAILED:missing_payment_token:${rawText.slice(0, 200)}`);
  }

  const username = json.payment_source?.venmo?.user_name?.trim() || null;
  const paymentMethodId = venmoWalletPaymentMethodId(paymentTokenId);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      venmoPaymentTokenId: paymentTokenId,
      venmoUsername: username,
      venmoVaultedAt: new Date(),
      paypalBuyerCustomerId: json.customer?.id?.trim() || user.paypalBuyerCustomerId,
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
