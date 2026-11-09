export type SellerLiveShippingLabelStatus = "awaiting_payment" | "labels_needed" | "partial" | "complete" | "empty";

export type SellerLiveShippingOrderRow = {
  id: string;
  listingTitle: string;
  itemPriceUsd: number;
  /** When true, the listing is excluded from combined bundled Shippo labels. */
  shipAlone: boolean;
  shippingChargedPortionCents: number | null;
  /** Actual purchased label cost (null = pending). Never a quote-only figure. */
  actualLabelCostCents: number | null;
  labelStatus: "quoted" | "purchased" | "pending" | "failed" | "refunded" | "voided";
  netShippingImpactCents: number;
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
  /** Alias for buyer shipping − actual labels + credits. */
  netShippingImpactCents: number;
  pendingLabelCount: number;
  failedLabelCount: number;
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
  /** Purchased label packages for this bundle (first label + any extra labels), oldest first. */
  packages?: SellerLiveShippingPackageRow[];
  /**
   * True when the seller may buy another label for this bundle: it already has its first label, the buyer
   * won 2+ Surprise Set spins, and there are fewer labels than paid orders.
   */
  canBuyAdditionalLabel?: boolean;
  /** Labels the seller can still add (paid orders minus labels bought). 0 when not allowed. */
  additionalLabelsRemaining?: number;
  /** Most labels this bundle can have (one per paid order). */
  maxLabelCount?: number;
  orders: SellerLiveShippingOrderRow[];
};

export type SellerLiveShippingPackageRow = {
  id: string;
  packageIndex: number;
  labelUrl: string | null;
  trackingNumber: string | null;
  carrier: string | null;
  serviceLevel: string | null;
  labelCostCents: number | null;
};

export type SellerLiveShippingDashboard = {
  totals: {
    shippingChargedCents: number;
    shippingLabelCostCents: number;
    netShippingImpactCents: number;
    pendingLabelCount: number;
    failedLabelCount: number;
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
    shipFromNeedsPhoneOnly: boolean;
  };
};
