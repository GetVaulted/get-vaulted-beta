-- Get Vaulted — foundation enums & extensions
-- Run order: first migration in chain

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Listing
-- ---------------------------------------------------------------------------
CREATE TYPE public.listing_type AS ENUM (
  'buy_now',
  'auction',
  'live_auction',
  'trade_only',
  'vault_drop',
  'break_spot'
);

CREATE TYPE public.listing_status AS ENUM (
  'draft',
  'live',
  'sold',
  'pending',
  'in_auction',
  'archived'
);

CREATE TYPE public.shipping_weight_tier AS ENUM (
  'cards_slabs',
  'sneakers',
  'memorabilia',
  'watches_luxury',
  'oversized_custom'
);

-- ---------------------------------------------------------------------------
-- Live shows
-- ---------------------------------------------------------------------------
CREATE TYPE public.live_show_status AS ENUM (
  'draft',
  'scheduled',
  'live',
  'ended',
  'cancelled'
);

CREATE TYPE public.stream_mode AS ENUM (
  'auction',
  'break',
  'shop',
  'drop',
  'hybrid'
);

CREATE TYPE public.live_item_status AS ENUM (
  'pending',
  'active',
  'sold',
  'passed',
  'cancelled'
);

-- ---------------------------------------------------------------------------
-- Trades
-- ---------------------------------------------------------------------------
CREATE TYPE public.trade_offer_status AS ENUM (
  'sent',
  'awaiting_response',
  'countered',
  'accepted',
  'declined',
  'fee_due',
  'labels_generated',
  'shipped',
  'delivered',
  'completed',
  'disputed'
);

-- ---------------------------------------------------------------------------
-- Payments / wallet
-- ---------------------------------------------------------------------------
CREATE TYPE public.payment_kind AS ENUM (
  'marketplace_checkout',
  'trade_fee',
  'auction_deposit',
  'wallet_topup',
  'platform_fee',
  'other'
);

CREATE TYPE public.payment_status AS ENUM (
  'pending',
  'processing',
  'succeeded',
  'failed',
  'refunded',
  'cancelled'
);

CREATE TYPE public.payout_status AS ENUM (
  'pending',
  'in_transit',
  'paid',
  'failed',
  'cancelled'
);

CREATE TYPE public.wallet_tx_kind AS ENUM (
  'credit',
  'debit',
  'hold',
  'release',
  'refund',
  'payout'
);

CREATE TYPE public.order_status AS ENUM (
  'pending_payment',
  'paid',
  'shipped',
  'delivered',
  'completed',
  'cancelled',
  'disputed'
);

CREATE TYPE public.shipping_label_status AS ENUM (
  'pending',
  'purchased',
  'in_transit',
  'delivered',
  'void',
  'error'
);
