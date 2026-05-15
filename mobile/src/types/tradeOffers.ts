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

export type TradeOfferVM = {
  id: string;
  status: TradeOfferStatus;
  sender_id: string;
  recipient_id: string;
  requested_item_id: string;
  offered_item_ids: string[];
  cash_difference: number;
  message: string | null;
  trade_fee: number;
  shipping_weight_tier: ShippingWeightTier | null;
  label_error_message: string | null;
  updated_at: string;
  sender: ProfileLite;
  recipient: ProfileLite;
  requested: ListingLite;
  offered: ListingLite[];
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
