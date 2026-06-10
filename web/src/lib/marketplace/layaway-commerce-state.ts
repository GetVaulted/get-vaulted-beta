import { LayawayStatus } from "@/generated/prisma/enums";
import {
  isActiveLayawayCanonical,
  isSellerFulfillmentCanonical,
  resolveMarketplaceCanonicalStatus,
  type MarketplaceCanonicalStatus,
} from "@/lib/marketplace/canonical-status";
import { deriveSellerLayawayUi, type SellerLayawayUiBucket } from "@/lib/layaway/seller-ui-status";
import { PAYMENT_PAID } from "@/services/payments";

export type LayawayCommerceRow = {
  status: string;
  dueAt: Date | string;
  remainingBalanceUsd: number;
  orderPaymentStatus?: string | null;
  listingStatus?: string | null;
  amountPaidUsd?: number;
  depositAmountUsd?: number;
};

export function resolveLayawayCommerceCanonical(row: LayawayCommerceRow): MarketplaceCanonicalStatus {
  return resolveMarketplaceCanonicalStatus({
    listingStatus: row.listingStatus ?? "active",
    layawayStatus: row.status,
    orderPaymentStatus: row.orderPaymentStatus,
    remainingBalanceUsd: row.remainingBalanceUsd,
    amountPaidUsd: row.amountPaidUsd,
    depositAmountUsd: row.depositAmountUsd,
  });
}

export function deriveSellerLayawayPresentation(row: LayawayCommerceRow): {
  canonical: MarketplaceCanonicalStatus;
  displayStatus: string;
  bucket: SellerLayawayUiBucket;
} {
  const canonical = resolveLayawayCommerceCanonical(row);
  if (canonical === "layaway_paid_in_full" || canonical === "sold") {
    return { canonical, displayStatus: "completed", bucket: "readyToShip" };
  }
  if (canonical === "defaulted") {
    return { canonical, displayStatus: "defaulted", bucket: "overdueOrDefaulted" };
  }
  if (canonical === "canceled") {
    return { canonical, displayStatus: "canceled", bucket: "overdueOrDefaulted" };
  }
  const ui = deriveSellerLayawayUi(row);
  return { canonical, displayStatus: ui.displayStatus, bucket: ui.bucket };
}

export function isActiveLayawayListRow(row: LayawayCommerceRow): boolean {
  return isActiveLayawayCanonical(resolveLayawayCommerceCanonical(row));
}

export function orderQualifiesForSellerFulfillment(row: {
  paymentStatus: string;
  layawayStatus?: string | null;
  listingStatus?: string | null;
  remainingBalanceUsd?: number | null;
}): boolean {
  if (row.paymentStatus === PAYMENT_PAID) return true;
  const canonical = resolveMarketplaceCanonicalStatus({
    listingStatus: row.listingStatus ?? "active",
    orderPaymentStatus: row.paymentStatus,
    layawayStatus: row.layawayStatus,
    remainingBalanceUsd: row.remainingBalanceUsd,
  });
  return isSellerFulfillmentCanonical(canonical);
}
