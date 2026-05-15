-- Trade offers & shipping labels (Shippo / EasyPost ready)

CREATE TABLE public.trade_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  requested_item_id UUID NOT NULL REFERENCES public.listings (id) ON DELETE RESTRICT,
  offered_item_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  cash_difference NUMERIC(14, 2) NOT NULL DEFAULT 0,
  message TEXT,
  status public.trade_offer_status NOT NULL DEFAULT 'sent',
  trade_fee NUMERIC(14, 2) NOT NULL DEFAULT 0,
  shipping_weight_tier public.shipping_weight_tier,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (sender_id <> recipient_id)
);

CREATE INDEX trade_offers_sender_idx ON public.trade_offers (sender_id);
CREATE INDEX trade_offers_recipient_idx ON public.trade_offers (recipient_id);
CREATE INDEX trade_offers_status_idx ON public.trade_offers (status);

CREATE TRIGGER trade_offers_set_updated_at
BEFORE UPDATE ON public.trade_offers
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.shipping_labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id UUID REFERENCES public.trade_offers (id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  carrier TEXT,
  label_url TEXT,
  tracking_number TEXT,
  status public.shipping_label_status NOT NULL DEFAULT 'pending',
  ship_by_date DATE,
  provider TEXT DEFAULT 'manual',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX shipping_labels_trade_idx ON public.shipping_labels (trade_id);
CREATE INDEX shipping_labels_user_idx ON public.shipping_labels (user_id);

-- ---------------------------------------------------------------------------
-- RLS trade_offers
-- ---------------------------------------------------------------------------
ALTER TABLE public.trade_offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants read own trades"
  ON public.trade_offers FOR SELECT
  TO authenticated
  USING (sender_id = auth.uid() OR recipient_id = auth.uid());

CREATE POLICY "Sender creates trade offers"
  ON public.trade_offers FOR INSERT
  TO authenticated
  WITH CHECK (sender_id = auth.uid());

CREATE POLICY "Participants update trades"
  ON public.trade_offers FOR UPDATE
  TO authenticated
  USING (sender_id = auth.uid() OR recipient_id = auth.uid())
  WITH CHECK (sender_id = auth.uid() OR recipient_id = auth.uid());

-- ---------------------------------------------------------------------------
-- RLS shipping_labels (owner or trade participant)
-- ---------------------------------------------------------------------------
ALTER TABLE public.shipping_labels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own labels"
  ON public.shipping_labels FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.trade_offers t
      WHERE t.id = trade_id AND (t.sender_id = auth.uid() OR t.recipient_id = auth.uid())
    )
  );

CREATE POLICY "Users insert own labels"
  ON public.shipping_labels FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users update own labels"
  ON public.shipping_labels FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Bundled trade fee (flat + tier); tune with ops — placeholder amounts for MVP.
CREATE OR REPLACE FUNCTION public.trade_fee_amount_for_tier(t public.shipping_weight_tier)
RETURNS NUMERIC AS $$
BEGIN
  RETURN CASE t
    WHEN 'cards_slabs' THEN 12.00
    WHEN 'sneakers' THEN 16.00
    WHEN 'memorabilia' THEN 22.00
    WHEN 'watches_luxury' THEN 28.00
    WHEN 'oversized_custom' THEN 45.00
    ELSE 15.00
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
