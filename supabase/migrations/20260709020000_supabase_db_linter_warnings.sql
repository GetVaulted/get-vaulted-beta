-- Supabase Database Linter warnings (functions + storage).
-- Auth dashboard: enable leaked-password protection + MFA separately.

-- ---------------------------------------------------------------------------
-- 1) Immutable search_path on trigger/helper functions
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trade_fee_amount_for_tier(t public.shipping_weight_tier)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
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
$$;

-- ---------------------------------------------------------------------------
-- 2) handle_new_user — auth trigger only, not a public RPC
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) is_username_available — SECURITY INVOKER (anon may read profiles.username)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_username_available(p_candidate text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.username IS NOT NULL
      AND lower(trim(p.username)) = lower(trim(p_candidate))
  );
$$;

REVOKE ALL ON FUNCTION public.is_username_available(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_username_available(text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4) marketplace_velocity_stats — service_role only; clients use web API
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.marketplace_velocity_stats() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.marketplace_velocity_stats() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marketplace_velocity_stats() TO service_role;

-- ---------------------------------------------------------------------------
-- 5) Public storage buckets — drop broad SELECT policies that allow listing
--    Public object URLs still work when bucket.public = true.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public read avatars" ON storage.objects;
DROP POLICY IF EXISTS "Public read listing media" ON storage.objects;
DROP POLICY IF EXISTS "Public read live thumbnails" ON storage.objects;
DROP POLICY IF EXISTS "Public read listing images" ON storage.objects;
