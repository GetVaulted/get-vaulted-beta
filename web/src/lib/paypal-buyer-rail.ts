/**
 * Shared PayPal buyer rail helpers (Venmo + PayPal Wallet) for live/off-session charges.
 */

import { prisma } from "@/lib/prisma";
import {
  chargeOrderWithVaultedVenmo,
  isVenmoWalletPaymentMethodId,
} from "@/lib/paypal-buyer-venmo";
import {
  chargeOrderWithVaultedPayPalWallet,
  isPayPalWalletPaymentMethodId,
} from "@/lib/paypal-buyer-wallet";
import { getPayPalAccessToken, paypalApiBase, paypalCredentialsConfigured } from "@/lib/paypal-auth";
import type { WalletPaymentMethodType } from "@/generated/prisma/client";

export function isPayPalRailWalletPaymentMethodId(id: string | null | undefined): boolean {
  return isVenmoWalletPaymentMethodId(id) || isPayPalWalletPaymentMethodId(id);
}

export function paypalRailWalletMethodType(
  walletPaymentMethodId: string,
): Extract<WalletPaymentMethodType, "venmo" | "paypal"> {
  return isPayPalWalletPaymentMethodId(walletPaymentMethodId) ? "paypal" : "venmo";
}

export type ChargePayPalRailResult =
  | { outcome: "paid"; processorPaymentId: string; walletType: "venmo" | "paypal" }
  | { outcome: "error"; code: string; message?: string };

/** Charge an order with vaulted Venmo or PayPal Wallet (platform-held PayPal balance). */
export async function chargeOrderWithPayPalRailWallet(args: {
  buyerId: string;
  orderId: string;
  amountUsd: number;
  description?: string;
  walletPaymentMethodId: string;
}): Promise<ChargePayPalRailResult> {
  const pm = args.walletPaymentMethodId.trim();
  if (isPayPalWalletPaymentMethodId(pm)) {
    const charged = await chargeOrderWithVaultedPayPalWallet({
      buyerId: args.buyerId,
      orderId: args.orderId,
      amountUsd: args.amountUsd,
      description: args.description,
    });
    if (charged.outcome !== "paid") {
      return { outcome: "error", code: charged.code, message: charged.message };
    }
    return { outcome: "paid", processorPaymentId: charged.processorPaymentId, walletType: "paypal" };
  }
  if (isVenmoWalletPaymentMethodId(pm)) {
    const charged = await chargeOrderWithVaultedVenmo({
      buyerId: args.buyerId,
      orderId: args.orderId,
      amountUsd: args.amountUsd,
      description: args.description,
    });
    if (charged.outcome !== "paid") {
      return { outcome: "error", code: charged.code, message: charged.message };
    }
    return { outcome: "paid", processorPaymentId: charged.processorPaymentId, walletType: "venmo" };
  }
  return { outcome: "error", code: "NOT_PAYPAL_RAIL_PM" };
}

/** Stamp order fields after a successful PayPal-rail capture (before finalize paid). */
export async function stampOrderPaidViaPayPalRail(args: {
  orderId: string;
  buyerId: string;
  walletPaymentMethodId: string;
  processorPaymentId: string;
}): Promise<void> {
  const walletType = paypalRailWalletMethodType(args.walletPaymentMethodId);
  await prisma.order.updateMany({
    where: {
      id: args.orderId,
      buyerId: args.buyerId,
      paymentStatus: { not: "paid" },
    },
    data: {
      paymentLabel: args.walletPaymentMethodId,
      paymentProcessor: "PAYPAL_VENMO",
      walletPaymentMethodType: walletType,
      walletPaymentMethodId: args.walletPaymentMethodId,
      processorPaymentId: args.processorPaymentId,
      sellerPayoutProcessor: "PAYPAL",
    },
  });
}

export type PayPalRailRefundResult =
  | { outcome: "refunded"; refundId: string }
  | { outcome: "error"; code: string; message?: string };

/**
 * Refund a captured PayPal/Venmo buyer-rail charge (financial-reconciliation-audit-2026-08 bug
 * #18 follow-up). Both `chargeOrderWithVaultedPayPalWallet` and `chargeOrderWithVaultedVenmo`
 * settle through the same PayPal Orders API v2 capture — `Order.processorPaymentId` is that
 * capture id — so a single refund endpoint covers both wallet types. Omit `amountUsd` for a full
 * refund of the original capture.
 */
export async function refundPayPalRailCapture(args: {
  processorPaymentId: string;
  amountUsd?: number;
}): Promise<PayPalRailRefundResult> {
  if (!paypalCredentialsConfigured()) {
    return { outcome: "error", code: "PAYPAL_RAIL_NOT_CONFIGURED" };
  }
  const captureId = args.processorPaymentId.trim();
  if (!captureId) {
    return { outcome: "error", code: "MISSING_PROCESSOR_PAYMENT_ID" };
  }

  try {
    const accessToken = await getPayPalAccessToken();
    const body =
      args.amountUsd != null
        ? {
            amount: {
              currency_code: "USD",
              value: (Math.round(args.amountUsd * 100) / 100).toFixed(2),
            },
          }
        : {};
    const res = await fetch(
      `${paypalApiBase()}/v2/payments/captures/${encodeURIComponent(captureId)}/refund`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "PayPal-Request-Id": `gv-refund-${captureId}`.slice(0, 64),
          Prefer: "return=representation",
        },
        body: JSON.stringify(body),
      },
    );
    const rawText = await res.text();
    let json: { id?: string; status?: string } = {};
    try {
      json = JSON.parse(rawText) as typeof json;
    } catch {
      /* empty */
    }
    if (!res.ok) {
      return { outcome: "error", code: "PAYPAL_RAIL_REFUND_FAILED", message: rawText.slice(0, 300) };
    }
    const refundId = json.id?.trim();
    if (!refundId) {
      return { outcome: "error", code: "PAYPAL_RAIL_REFUND_MISSING_ID", message: rawText.slice(0, 300) };
    }
    return { outcome: "refunded", refundId };
  } catch (e) {
    return {
      outcome: "error",
      code: "PAYPAL_RAIL_REFUND_EXCEPTION",
      message: e instanceof Error ? e.message : String(e),
    };
  }
}
