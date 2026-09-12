import { prisma } from "@/lib/prisma";
import { getBuyerLiveWalletReadiness } from "@/lib/buyer-live-wallet-readiness";
import {
  defaultWalletCapabilities,
  type BuyerWalletPaymentMethodDTO,
  type BuyerWalletSummaryDTO,
} from "@/lib/payment-processor";
import { getAvailablePlatformCreditUsd } from "@/lib/giveaway/platform-credit";
import { getUserReferralSummary } from "@/lib/referral-credit";
import { listBuyerWalletPaymentMethods } from "@/lib/stripe-customer";
import { isStripeConfigured, getStripePublishableKey } from "@/lib/stripe";

export async function buildBuyerWalletSummary(userId: string): Promise<BuyerWalletSummaryDTO> {
  const [{ paymentReady, shippingReady }, paymentMethods, defaultAddress, referral, vaultCreditsUsd] =
    await Promise.all([
    getBuyerLiveWalletReadiness(userId),
    listBuyerWalletPaymentMethods(userId),
    prisma.address.findFirst({
      where: { userId, type: "shipping", isDefault: true },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    }),
    getUserReferralSummary(userId),
    getAvailablePlatformCreditUsd(userId),
  ]);

  // `listBuyerWalletPaymentMethods` already resolves the correct default (Stripe card/wallet,
  // vaulted Venmo, or vaulted PayPal) and marks it on each row — re-deriving it here via a
  // second `getBuyerDefaultCardPaymentMethodId` call duplicated a whole extra round of Stripe
  // API calls on every wallet load (part of the fix for GET-VAULTED-H's Stripe rate-limit errors).
  const defaultPaymentMethod = paymentMethods.find((pm) => pm.isDefault) ?? paymentMethods[0] ?? null;

  const stripeConfigured = isStripeConfigured();
  const publishableKey = stripeConfigured ? getStripePublishableKey().trim() : "";

  return {
    paymentReady,
    shippingReady,
    walletReady: paymentReady && shippingReady,
    vaultCreditsUsd,
    referralCreditUsd: referral.availableUsd,
    referralCreditPendingUsd: referral.pendingUsd,
    referralCode: referral.referralCode,
    referralSuccessfulReferrals: referral.successfulReferrals,
    promoCodeApplied: null,
    promoDiscountUsd: 0,
    stripePublishableKey: publishableKey || null,
    capabilities: defaultWalletCapabilities(stripeConfigured),
    defaultPaymentMethod,
    paymentMethods,
    defaultShippingAddressId: defaultAddress?.id ?? null,
  };
}

export type { BuyerWalletPaymentMethodDTO, BuyerWalletSummaryDTO };
