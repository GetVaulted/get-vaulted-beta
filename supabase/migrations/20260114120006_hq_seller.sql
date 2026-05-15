-- HQ / seller hub support: settings + lightweight analytics snapshots

CREATE TABLE public.seller_settings (
  user_id UUID PRIMARY KEY REFERENCES public.profiles (id) ON DELETE CASCADE,
  default_listing_type public.listing_type,
  default_shipping_tier public.shipping_weight_tier,
  notify_live_going_live BOOLEAN NOT NULL DEFAULT true,
  notify_trade_updates BOOLEAN NOT NULL DEFAULT true,
  payout_schedule TEXT NOT NULL DEFAULT 'weekly' CHECK (payout_schedule IN ('daily', 'weekly', 'manual')),
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER seller_settings_set_updated_at
BEFORE UPDATE ON public.seller_settings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.seller_analytics_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  day DATE NOT NULL,
  revenue_cents BIGINT NOT NULL DEFAULT 0,
  orders_count INTEGER NOT NULL DEFAULT 0,
  live_minutes INTEGER NOT NULL DEFAULT 0,
  trade_offers_count INTEGER NOT NULL DEFAULT 0,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, day)
);

CREATE INDEX seller_analytics_user_day_idx ON public.seller_analytics_daily (user_id, day DESC);

ALTER TABLE public.seller_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sellers read own settings"
  ON public.seller_settings FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Sellers insert own settings"
  ON public.seller_settings FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Sellers update own settings"
  ON public.seller_settings FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

ALTER TABLE public.seller_analytics_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sellers read own analytics"
  ON public.seller_analytics_daily FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Analytics rows are populated by cron/service role in production (no client insert).
