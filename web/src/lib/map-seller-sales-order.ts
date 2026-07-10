import { sellerNextActionForOrder } from "@/lib/seller-fulfillment-next-action";
import { resolveOrderCommerceSnapshot } from "@/lib/marketplace/commerce-state";
import {
  estimateSellerOrderPayoutUsd,
  estimatePlatformFeeUsd,
  estimateStripeProcessingFeeUsd,
  resolvePlatformFeePercentForSellerOrder,
} from "@/lib/seller-payout-estimate";
import { liveShowGmvForFeeTierReconstruction } from "@/lib/live-show-gmv";

export type SellerSalesOrderUser = {
  stripeAccountId: string | null;
  stripeOnboardingComplete: boolean;
  shipFromName: string | null;
  shipFromStreet: string | null;
  shipFromCity: string | null;
  shipFromState: string | null;
  shipFromZip: string | null;
  shipFromCountry: string | null;
  sellerPlatformFeePercentOverride?: number | null;
};

export type SellerSalesOrderRowInput = {
  id: string;
  buyerId: string;
  sellerId: string;
  totalUsd: number;
  itemPriceUsd: number;
  shippingPriceUsd: number;
  taxUsd: number;
  taxAmountCents: number;
  status: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  createdAt: Date;
  shipRecipientName: string;
  shipAddress: string;
  shipCity: string;
  shipState: string;
  shipZip: string;
  shipCountry: string;
  carrier: string | null;
  service: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  labelUrl: string | null;
  shippoTransactionId: string | null;
  shippingStatus: string | null;
  labelCreatedAt: Date | null;
  shippedAt: Date | null;
  paymentDeadlineAt: Date | null;
  payoutStatus: string;
  payoutBlockedReason: string | null;
  payoutHoldUntil: Date | null;
  payoutReserveAmountCents: number;
  deliveryConfirmedAt: Date | null;
  payoutMethod: string;
  shippingLabelCostCents?: number | null;
  shippingLabelCostReversedCents?: number | null;
  liveShippingSession: {
    liveShowId: string | null;
    liveShow: { completedSalesGmvUsd: number; finalSalesGmvUsd: number | null; status: string; title?: string } | null;
  } | null;
  listing: {
    id: string;
    title: string;
    status: string;
    isCompanyListing: boolean;
    images: { url: string }[];
  };
  buyer: { username: string | null };
  layaway: { status: string; remainingBalanceUsd: number } | null;
};

export function mapSellerSalesOrderForApi(user: SellerSalesOrderUser, o: SellerSalesOrderRowInput) {
  const liveShowId = o.liveShippingSession?.liveShowId ?? null;
  const liveShow = o.liveShippingSession?.liveShow;
  const platformFeePercent = resolvePlatformFeePercentForSellerOrder({
    isCompanyListing: Boolean(o.listing.isCompanyListing),
    liveShowId,
    liveShowCompletedGmvUsd: liveShowGmvForFeeTierReconstruction(liveShow),
    orderItemPriceUsd: o.itemPriceUsd,
    orderPaymentStatus: o.paymentStatus,
    sellerPlatformFeePercentOverride: user.sellerPlatformFeePercentOverride,
  });
  const commerce = resolveOrderCommerceSnapshot({
    id: o.id,
    listingId: o.listing.id,
    buyerId: o.buyerId,
    sellerId: o.sellerId,
    status: o.status,
    paymentStatus: o.paymentStatus,
    fulfillmentStatus: o.fulfillmentStatus,
    trackingNumber: o.trackingNumber,
    listingStatus: o.listing.status,
    layawayStatus: o.layaway?.status ?? null,
    remainingBalanceUsd: o.layaway?.remainingBalanceUsd ?? null,
  });

  const taxAmountCents = Math.max(0, o.taxAmountCents ?? 0);
  const taxUsd = Math.max(o.taxUsd ?? 0, taxAmountCents / 100);

  return {
    id: o.id,
    totalUsd: o.totalUsd,
    itemPriceUsd: o.itemPriceUsd,
    shippingPriceUsd: o.shippingPriceUsd,
    taxUsd,
    taxAmountCents,
    salesTaxRemittanceNote:
      taxAmountCents > 0
        ? "Get Vaulted collects and remits applicable sales tax on marketplace sales where required."
        : null,
    status: o.status,
    paymentStatus: o.paymentStatus,
    fulfillmentStatus: o.fulfillmentStatus,
    commerceBucket: commerce.sellerBucket,
    liveShowId,
    liveShowTitle: liveShow?.title ?? null,
    liveShowStatus: liveShow?.status ?? null,
    createdAt: o.createdAt.toISOString(),
    shipRecipientName: o.shipRecipientName,
    shipAddress: o.shipAddress,
    shipCity: o.shipCity,
    shipState: o.shipState,
    shipZip: o.shipZip,
    shipCountry: o.shipCountry,
    carrier: o.carrier,
    service: o.service,
    trackingNumber: o.trackingNumber,
    trackingUrl: o.trackingUrl,
    labelUrl: o.labelUrl,
    shippoTransactionId: o.shippoTransactionId,
    shippingStatus: o.shippingStatus,
    labelCreatedAt: o.labelCreatedAt?.toISOString() ?? null,
    shippedAt: o.shippedAt?.toISOString() ?? null,
    paymentDeadlineAt: o.paymentDeadlineAt?.toISOString() ?? null,
    payoutStatus: o.payoutStatus,
    payoutBlockedReason: o.payoutBlockedReason,
    payoutHoldUntil: o.payoutHoldUntil?.toISOString() ?? null,
    payoutReserveAmountCents: o.payoutReserveAmountCents,
    deliveryConfirmedAt: o.deliveryConfirmedAt?.toISOString() ?? null,
    payoutMethod: o.payoutMethod,
    platformFeePercent,
    platformFeeEstimateUsd: estimatePlatformFeeUsd({
      itemPriceUsd: o.itemPriceUsd,
      platformFeePercent,
    }),
    stripeProcessingFeeEstimateUsd: estimateStripeProcessingFeeUsd(o.totalUsd),
    shippingLabelCostCents: o.shippingLabelCostCents ?? null,
    shippingLabelCostReversedCents: o.shippingLabelCostReversedCents ?? null,
    payoutEstimateUsd: estimateSellerOrderPayoutUsd({
      itemPriceUsd: o.itemPriceUsd,
      shippingPriceUsd: o.shippingPriceUsd,
      payoutReserveAmountCents: o.payoutReserveAmountCents,
      platformFeePercent,
      shippingLabelCostCents: o.shippingLabelCostCents,
      shippingLabelCostReversedCents: o.shippingLabelCostReversedCents,
    }),
    listing: o.listing,
    buyer: o.buyer,
    sellerNextAction: sellerNextActionForOrder(user, o).label,
  };
}
