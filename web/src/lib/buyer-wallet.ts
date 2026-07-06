import { prisma } from "@/lib/prisma";
import { getBuyerLiveWalletReadiness } from "@/lib/buyer-live-wallet-readiness";
import {
  defaultWalletCapabilities,
  type BuyerWalletPaymentMethodDTO,
  type BuyerWalletSummaryDTO,
} from "@/lib/payment-processor";
import { getUserReferralSummary } from "@/lib/referral-credit";
import {
  getBuyerDefaultCardPaymentMethodId,
  listBuyerWalletPaymentMethods,
} from "@/lib/stripe-customer";
import { isStripeConfigured, getStripePublishableKey } from "@/lib/stripe";

export async function buildBuyerWalletSummary(userId: string): Promise<BuyerWalletSummaryDTO> {
  const [{ paymentReady, shippingReady }, paymentMethods, defaultAddress, referral] = await Promise.all([
    getBuyerLiveWalletReadiness(userId),
    listBuyerWalletPaymentMethods(userId),
    prisma.address.findFirst({
      where: { userId, type: "shipping", isDefault: true },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    }),
    getUserReferralSummary(userId),
  ]);

  const defaultPmId = await getBuyerDefaultCardPaymentMethodId(userId);
  const defaultPaymentMethod =
    paymentMethods.find((pm) => pm.id === defaultPmId) ?? paymentMethods.find((pm) => pm.isDefault) ?? paymentMethods[0] ?? null;

  const stripeConfigured = isStripeConfigured();
  const publishableKey = stripeConfigured ? getStripePublishableKey().trim() : "";

  return {
    paymentReady,
    shippingReady,
    walletReady: paymentReady && shippingReady,
    vaultCreditsUsd: 0,
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
