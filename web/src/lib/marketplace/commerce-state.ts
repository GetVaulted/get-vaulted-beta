import { LayawayStatus } from "@/generated/prisma/enums";
import {
  isActiveLayawayCanonical,
  isListingPurchasable,
  resolveMarketplaceCanonicalStatus,
  type MarketplaceCanonicalStatus,
} from "@/lib/marketplace/canonical-status";
import {
  deriveSellerLayawayPresentation,
  isActiveLayawayListRow,
  orderQualifiesForSellerFulfillment,
  type LayawayCommerceRow,
} from "@/lib/marketplace/layaway-commerce-state";
import { PAYMENT_LAYAWAY_ACTIVE } from "@/lib/layaway/constants";
import { PAYMENT_PAID } from "@/services/payments";

/** Seller-facing commerce buckets shared by web + mobile APIs. */
export type CommerceSellerBucket =
  | "active_listing"
  | "active_layaway"
  | "paid_order"
  | "fulfillment"
  | "completed_sale"
  | "canceled_defaulted";

export type CommerceListingInput = {
  id: string;
  status: string;
  sellerId: string;
};

export type CommerceOrderInput = {
  id: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
  status: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  trackingNumber?: string | null;
  layawayStatus?: string | null;
  listingStatus?: string | null;
  remainingBalanceUsd?: number | null;
};

export type CommerceLayawayInput = LayawayCommerceRow & {
  id: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
};

export type CommerceListingSnapshot = {
  listingId: string;
  sellerId: string;
  listingStatus: string;
  canonicalStatus: MarketplaceCanonicalStatus;
  sellerBucket: CommerceSellerBucket;
  purchasable: boolean;
};

export type CommerceOrderSnapshot = {
  orderId: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
  status: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  canonicalStatus: MarketplaceCanonicalStatus;
  sellerBucket: CommerceSellerBucket;
  appearsInSellerOrdersApi: boolean;
  appearsInSellerFulfillment: boolean;
};

export type CommerceLayawaySnapshot = {
  layawayId: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
  status: string;
  displayStatus: string;
  canonicalStatus: MarketplaceCanonicalStatus;
  sellerBucket: CommerceSellerBucket;
  appearsInActiveLayawayList: boolean;
};

export type ListingCommerceDiagnostics = {
  listing: CommerceListingSnapshot;
  orders: CommerceOrderSnapshot[];
  layaways: CommerceLayawaySnapshot[];
  conflicts: string[];
  generatedAt: string;
};

function orderCanonical(order: CommerceOrderInput): MarketplaceCanonicalStatus {
  return resolveMarketplaceCanonicalStatus({
    listingStatus: order.listingStatus ?? "active",
    orderPaymentStatus: order.paymentStatus,
    layawayStatus: order.layawayStatus,
    remainingBalanceUsd: order.remainingBalanceUsd,
  });
}

export function resolveListingCommerceSnapshot(
  listing: CommerceListingInput,
  context?: { hasActiveLayaway?: boolean; hasPaidOrder?: boolean },
): CommerceListingSnapshot {
  const canonicalStatus = resolveMarketplaceCanonicalStatus({
    listingStatus: listing.status,
    layawayStatus: context?.hasActiveLayaway ? LayawayStatus.active : null,
    orderPaymentStatus: context?.hasPaidOrder ? PAYMENT_PAID : null,
  });

  let sellerBucket: CommerceSellerBucket = "active_listing";
  if (canonicalStatus === "sold" || canonicalStatus === "layaway_paid_in_full") {
    sellerBucket = context?.hasPaidOrder ? "fulfillment" : "completed_sale";
  } else if (isActiveLayawayCanonical(canonicalStatus)) {
    sellerBucket = "active_layaway";
  } else if (canonicalStatus === "canceled" || canonicalStatus === "defaulted") {
    sellerBucket = "canceled_defaulted";
  } else if (!isListingPurchasable(canonicalStatus) && listing.status === "sold") {
    sellerBucket = "completed_sale";
  }

  return {
    listingId: listing.id,
    sellerId: listing.sellerId,
    listingStatus: listing.status,
    canonicalStatus,
    sellerBucket,
    purchasable: isListingPurchasable(canonicalStatus),
  };
}

export function resolveOrderCommerceSnapshot(order: CommerceOrderInput): CommerceOrderSnapshot {
  const canonicalStatus = orderCanonical(order);
  const appearsInSellerFulfillment = orderQualifiesForSellerFulfillment({
    paymentStatus: order.paymentStatus,
    layawayStatus: order.layawayStatus,
    listingStatus: order.listingStatus,
    remainingBalanceUsd: order.remainingBalanceUsd,
  });

  let sellerBucket: CommerceSellerBucket = "paid_order";
  if (order.paymentStatus === "cancelled" || order.paymentStatus === "expired") {
    sellerBucket = "canceled_defaulted";
  } else if (order.status === "completed" || order.status === "delivered") {
    sellerBucket = "completed_sale";
  } else if (
    order.paymentStatus === PAYMENT_PAID &&
    (order.fulfillmentStatus === "pending" ||
      order.fulfillmentStatus === "processing" ||
      order.status === "paid" ||
      order.status === "shipped")
  ) {
    sellerBucket = "fulfillment";
  } else if (order.paymentStatus === PAYMENT_PAID) {
    sellerBucket = "paid_order";
  } else if (order.paymentStatus === PAYMENT_LAYAWAY_ACTIVE || order.layawayStatus === LayawayStatus.active) {
    sellerBucket = "active_layaway";
  }

  return {
    orderId: order.id,
    listingId: order.listingId,
    buyerId: order.buyerId,
    sellerId: order.sellerId,
    status: order.status,
    paymentStatus: order.paymentStatus,
    fulfillmentStatus: order.fulfillmentStatus,
    canonicalStatus,
    sellerBucket,
    appearsInSellerOrdersApi: appearsInSellerFulfillment,
    appearsInSellerFulfillment: appearsInSellerFulfillment,
  };
}

export function resolveLayawayCommerceSnapshot(layaway: CommerceLayawayInput): CommerceLayawaySnapshot {
  const presentation = deriveSellerLayawayPresentation(layaway);
  let sellerBucket: CommerceSellerBucket = "active_layaway";
  if (presentation.canonical === "sold" || presentation.canonical === "layaway_paid_in_full") {
    sellerBucket = "fulfillment";
  } else if (presentation.canonical === "defaulted" || presentation.canonical === "canceled") {
    sellerBucket = "canceled_defaulted";
  } else if (isActiveLayawayCanonical(presentation.canonical)) {
    sellerBucket = "active_layaway";
  }

  return {
    layawayId: layaway.id,
    listingId: layaway.listingId,
    buyerId: layaway.buyerId,
    sellerId: layaway.sellerId,
    status: layaway.status,
    displayStatus: presentation.displayStatus,
    canonicalStatus: presentation.canonical,
    sellerBucket,
    appearsInActiveLayawayList: isActiveLayawayListRow(layaway),
  };
}

export function buildListingCommerceDiagnostics(args: {
  listing: CommerceListingInput;
  orders: CommerceOrderInput[];
  layaways: CommerceLayawayInput[];
}): ListingCommerceDiagnostics {
  const orderSnapshots = args.orders.map(resolveOrderCommerceSnapshot);
  const layawaySnapshots = args.layaways.map(resolveLayawayCommerceSnapshot);

  const hasActiveLayaway = layawaySnapshots.some((l) => l.appearsInActiveLayawayList);
  const hasPaidOrder = orderSnapshots.some((o) => o.paymentStatus === PAYMENT_PAID);

  const listingSnapshot = resolveListingCommerceSnapshot(args.listing, { hasActiveLayaway, hasPaidOrder });

  const conflicts: string[] = [];
  const paidFulfillmentOrders = orderSnapshots.filter((o) => o.appearsInSellerFulfillment);
  const activeLayaways = layawaySnapshots.filter((l) => l.appearsInActiveLayawayList);

  if (paidFulfillmentOrders.length > 0 && activeLayaways.length > 0) {
    conflicts.push("PAID_ORDER_AND_ACTIVE_LAYAWAY");
  }
  if (args.listing.status === "sold" && activeLayaways.length > 0) {
    conflicts.push("SOLD_LISTING_WITH_ACTIVE_LAYAWAY");
  }
  for (const order of paidFulfillmentOrders) {
    if (!order.appearsInSellerOrdersApi) {
      conflicts.push(`PAID_ORDER_HIDDEN_FROM_SELLER_API:${order.orderId}`);
    }
  }

  return {
    listing: listingSnapshot,
    orders: orderSnapshots,
    layaways: layawaySnapshots,
    conflicts,
    generatedAt: new Date().toISOString(),
  };
}
