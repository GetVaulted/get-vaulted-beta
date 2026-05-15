-- Marketplace listings & buyer orders

CREATE TABLE public.listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  subcategory TEXT,
  price NUMERIC(14, 2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'usd',
  listing_type public.listing_type NOT NULL,
  condition TEXT,
  grade TEXT,
  authentication_status TEXT NOT NULL DEFAULT 'unknown'
    CHECK (authentication_status IN ('unknown', 'seller_declared', 'visible_in_media', 'vaulted_verified')),
  media_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  status public.listing_status NOT NULL DEFAULT 'draft',
  accepts_trades BOOLEAN NOT NULL DEFAULT false,
  shipping_weight_tier public.shipping_weight_tier,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX listings_seller_idx ON public.listings (seller_id);
CREATE INDEX listings_status_idx ON public.listings (status);
CREATE INDEX listings_category_idx ON public.listings (category);
CREATE INDEX listings_created_idx ON public.listings (created_at DESC);

CREATE TRIGGER listings_set_updated_at
BEFORE UPDATE ON public.listings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES public.listings (id) ON DELETE RESTRICT,
  buyer_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  seller_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  status public.order_status NOT NULL DEFAULT 'pending_payment',
  total_cents BIGINT NOT NULL CHECK (total_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'usd',
  stripe_checkout_session_id TEXT,
  stripe_payment_intent_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX orders_buyer_idx ON public.orders (buyer_id);
CREATE INDEX orders_seller_idx ON public.orders (seller_id);
CREATE INDEX orders_listing_idx ON public.orders (listing_id);

CREATE TRIGGER orders_set_updated_at
BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: listings
-- ---------------------------------------------------------------------------
ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read live listings or own drafts"
  ON public.listings FOR SELECT
  USING (status = 'live' OR seller_id = auth.uid());

CREATE POLICY "Sellers insert own listings"
  ON public.listings FOR INSERT
  TO authenticated
  WITH CHECK (seller_id = auth.uid());

CREATE POLICY "Sellers update own listings"
  ON public.listings FOR UPDATE
  TO authenticated
  USING (seller_id = auth.uid())
  WITH CHECK (seller_id = auth.uid());

CREATE POLICY "Sellers delete own draft listings"
  ON public.listings FOR DELETE
  TO authenticated
  USING (seller_id = auth.uid() AND status = 'draft');

-- ---------------------------------------------------------------------------
-- RLS: orders (participants only)
-- ---------------------------------------------------------------------------
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Buyers and sellers read own orders"
  ON public.orders FOR SELECT
  TO authenticated
  USING (buyer_id = auth.uid() OR seller_id = auth.uid());

-- Inserts typically via Edge Function / Netlify with service role; allow buyer to create pending row if needed:
CREATE POLICY "Buyers create orders"
  ON public.orders FOR INSERT
  TO authenticated
  WITH CHECK (buyer_id = auth.uid());

CREATE POLICY "Participants update own orders"
  ON public.orders FOR UPDATE
  TO authenticated
  USING (buyer_id = auth.uid() OR seller_id = auth.uid())
  WITH CHECK (buyer_id = auth.uid() OR seller_id = auth.uid());
