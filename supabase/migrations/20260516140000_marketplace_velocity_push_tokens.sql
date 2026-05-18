-- Public marketplace velocity (no fabricated metrics) + push device tokens

CREATE OR REPLACE FUNCTION public.marketplace_velocity_stats()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'sold_today',
    (
      SELECT count(*)::int
      FROM public.orders o
      WHERE o.status IN ('paid', 'shipped', 'delivered', 'completed')
        AND o.created_at >= (date_trunc('day', now() AT TIME ZONE 'utc'))
    ),
    'completed_sales',
    (SELECT count(*)::int FROM public.orders o WHERE o.status IN ('delivered', 'completed')),
    'active_listings',
    (SELECT count(*)::int FROM public.listings l WHERE l.status = 'live')
  );
$$;

REVOKE ALL ON FUNCTION public.marketplace_velocity_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.marketplace_velocity_stats() TO anon, authenticated;

COMMENT ON FUNCTION public.marketplace_velocity_stats IS 'Aggregate marketplace velocity for discovery UI; returns null fields when zero is valid.';

CREATE TABLE IF NOT EXISTS public.push_device_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  expo_push_token TEXT NOT NULL,
  platform TEXT,
  device_name TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, expo_push_token)
);

CREATE INDEX IF NOT EXISTS push_device_tokens_user_idx ON public.push_device_tokens (user_id);

ALTER TABLE public.push_device_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own push tokens"
  ON public.push_device_tokens
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
