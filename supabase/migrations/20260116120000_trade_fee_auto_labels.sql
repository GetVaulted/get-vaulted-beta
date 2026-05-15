-- Trade fee → Shippo auto-labels: schema for webhook idempotency, errors, and new statuses

-- New trade lifecycle values (append; PG 15+ IF NOT EXISTS)
ALTER TYPE public.trade_offer_status ADD VALUE IF NOT EXISTS 'labels_pending';
ALTER TYPE public.trade_offer_status ADD VALUE IF NOT EXISTS 'labels_generating';
ALTER TYPE public.trade_offer_status ADD VALUE IF NOT EXISTS 'label_error';

ALTER TABLE public.trade_offers
  ADD COLUMN IF NOT EXISTS label_error_message TEXT,
  ADD COLUMN IF NOT EXISTS fee_payment_id UUID REFERENCES public.payments (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.trade_offers.label_error_message IS 'Last auto-label failure from Stripe webhook / Shippo (cleared on success).';
COMMENT ON COLUMN public.trade_offers.fee_payment_id IS 'payments row for succeeded Get Vaulted trade fee checkout.';

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS stripe_event_id TEXT,
  ADD COLUMN IF NOT EXISTS trade_offer_id UUID REFERENCES public.trade_offers (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.payments.stripe_event_id IS 'Stripe Event id — unique for webhook idempotency.';
COMMENT ON COLUMN public.payments.trade_offer_id IS 'Set when kind = trade_fee; links fee to trade.';

CREATE UNIQUE INDEX IF NOT EXISTS payments_stripe_event_id_uidx
  ON public.payments (stripe_event_id)
  WHERE stripe_event_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS payments_trade_fee_succeeded_trade_uidx
  ON public.payments (trade_offer_id)
  WHERE kind = 'trade_fee' AND status = 'succeeded' AND trade_offer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS payments_stripe_checkout_session_idx
  ON public.payments (stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS payments_trade_offer_idx
  ON public.payments (trade_offer_id)
  WHERE trade_offer_id IS NOT NULL;

ALTER TABLE public.shipping_labels
  ADD COLUMN IF NOT EXISTS shippo_error_message TEXT;

COMMENT ON COLUMN public.shipping_labels.shippo_error_message IS 'Populated when label purchase fails (optional diagnostics).';
