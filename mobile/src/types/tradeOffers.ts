/** Matches `public.trade_offer_status` (+ app display helpers). */
export type TradeOfferStatus =
  | 'sent'
  | 'awaiting_response'
  | 'countered'
  | 'accepted'
  | 'declined'
  | 'fee_due'
  | 'labels_pending'
  | 'labels_generating'
  | 'labels_generated'
  | 'label_error'
  | 'shipped'
  | 'delivered'
  | 'completed'
  | 'disputed';

export type ShippingWeightTier =
  | 'cards_slabs'
  | 'sneakers'
  | 'memorabilia'
  | 'watches_luxury'
  | 'oversized_custom';

export type ProfileLite = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

export type ListingLite = {
  id: string;
  title: string;
  price: number;
  currency: string;
  media_urls: unknown;
  condition: string | null;
  authentication_status: string;
};

/** Per-party fee/label/ship/receive progress from web Prisma trades. */
export type TradePartyFulfillmentVM = {
  platform_fee_paid_at: string | null;
  label_url: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  label_purchased_at: string | null;
  label_error_message: string | null;
  shipped_at: string | null;
  received_at: string | null;
};

export type TradeOfferVM = {
  id: string;
  status: TradeOfferStatus;
  sender_id: string;
  recipient_id: string;
  requested_item_id: string;
  offered_item_ids: string[];
  cash_difference: number;
  message: string | null;
  /** Linked MessageThread id when trade chat has been opened. */
  conversation_id: string | null;
  /** ISO timestamp when on-platform trade cash was paid. */
  cash_paid_at: string | null;
  /** Locked deposit amount in cents (straight trades). */
  security_deposit_cents: number | null;
  /** Straight-trade security deposit timestamps (proposer / recipient). */
  proposer_deposit_paid_at: string | null;
  recipient_deposit_paid_at: string | null;
  trade_fee: number;
  shipping_weight_tier: ShippingWeightTier | null;
  label_error_message: string | null;
  updated_at: string;
  sender: ProfileLite;
  recipient: ProfileLite;
  requested: ListingLite;
  offered: ListingLite[];
  proposer_fulfillment: TradePartyFulfillmentVM | null;
  recipient_fulfillment: TradePartyFulfillmentVM | null;
};

export type ShippingLabelVM = {
  id: string;
  user_id: string;
  sender_user_id: string | null;
  recipient_user_id: string | null;
  carrier: string | null;
  service_level: string | null;
  label_url: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  status: string;
  ship_by_date: string | null;
  cost: number | null;
};
