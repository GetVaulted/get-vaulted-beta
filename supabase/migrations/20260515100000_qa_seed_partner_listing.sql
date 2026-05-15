-- QA: insert a live trade listing for another user (demo partner). RLS blocks this from the client;
-- SECURITY DEFINER allows seeding when the caller is authenticated and the target is a different profile.

CREATE OR REPLACE FUNCTION public.qa_seed_partner_trade_listing(p_partner_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_partner_user_id IS NULL OR p_partner_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Invalid partner user id';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_partner_user_id) THEN
    RAISE EXCEPTION 'Partner profile not found';
  END IF;

  INSERT INTO public.listings (
    seller_id,
    title,
    description,
    category,
    listing_type,
    price,
    currency,
    authentication_status,
    media_urls,
    status,
    accepts_trades,
    shipping_weight_tier,
    metadata
  ) VALUES (
    p_partner_user_id,
    'QA trade listing (partner placeholder)',
    'Auto-created by Trade Center QA RPC qa_seed_partner_trade_listing',
    'trade_qa',
    'trade_only'::public.listing_type,
    1.00,
    'usd',
    'unknown',
    '["https://placehold.co/600x400/png"]'::jsonb,
    'live'::public.listing_status,
    true,
    'cards_slabs'::public.shipping_weight_tier,
    jsonb_build_object('qa_seed', true, 'seeded_by', auth.uid()::text)
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.qa_seed_partner_trade_listing(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.qa_seed_partner_trade_listing(uuid) TO authenticated;

COMMENT ON FUNCTION public.qa_seed_partner_trade_listing IS 'QA: create one live trade_only listing for p_partner_user_id (must exist, not caller).';
