export type SellerLiveShippingLabelStatus = "awaiting_payment" | "labels_needed" | "partial" | "complete" | "empty";

export type SellerLiveShippingOrderRow = {
  id: string;
  listingTitle: string;
  itemPriceUsd: number;
  /** When true, the listing is excluded from combined bundled Shippo labels. */
  shipAlone: boolean;
  shippingChargedPortionCents: number | null;
  orderStatus: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  trackingNumber: string | null;
  hasLabel: boolean;
  shippingLabelCostCents: number | null;
};

export type SellerLiveShippingSessionRow = {
  sessionId: string;
  liveShowId: string;
  liveShowTitle: string;
  liveShowStatus: string;
  buyer: { id: string; username: string; name: string | null };
  destinationAddressId: string | null;
  bundled: boolean;
  itemCount: number;
  orderCount: number;
  pricingWeightOz: number;
  sessionShippingCents: number;
  shippingChargedCents: number;
  shippingLabelCostCents: number;
  marginCents: number;
  marginNegative: boolean;
  capReached: boolean;
  labelStatus: SellerLiveShippingLabelStatus;
  ordersNeedingLabels: string[];
  /** True when this session can use POST …/live-shipping/[sessionId]/create-label (combined bundle, no labels yet, ≥1 eligible paid order). */
  canCreateBundledLabel: boolean;
  /** First label found on any order in the session (same Shippo transaction when created via bundle). */
  bundledLabel: {
    labelUrl: string | null;
    trackingNumber: string | null;
    shippoTransactionId: string | null;
  } | null;
  orders: SellerLiveShippingOrderRow[];
};

export type SellerLiveShippingDashboard = {
  totals: {
    shippingChargedCents: number;
    shippingLabelCostCents: number;
    marginCents: number;
    marginNegative: boolean;
  };
  sessions: SellerLiveShippingSessionRow[];
  /** Runtime label prerequisites — helps distinguish env vs ship-from vs Shippo API issues. */
  labelSetup?: {
    shippoTokenPresent: boolean;
    shippoTokenKind: "test" | "live" | "missing" | "unknown";
    shippoApiOk: boolean;
    shippoApiError: string | null;
    shipFromComplete: boolean;
  };
};
