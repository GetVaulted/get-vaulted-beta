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
