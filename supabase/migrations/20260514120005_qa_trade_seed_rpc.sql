-- QA / dev helpers: RLS prevents inserting "incoming" offers (sender ≠ auth.uid()) and
-- partner shipping_labels from the mobile app. These SECURITY DEFINER RPCs gate on
-- trade participation or listing ownership so only legitimate QA setups can run.

CREATE OR REPLACE FUNCTION public.qa_create_incoming_trade_from_demo(
  p_demo_sender_id uuid,
  p_requested_item_id uuid,
  p_offered_item_ids uuid[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_seller uuid;
  v_fee numeric;
  v_new_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_demo_sender_id IS NULL OR p_demo_sender_id = v_uid THEN
    RAISE EXCEPTION 'Invalid demo sender';
  END IF;
  IF p_offered_item_ids IS NULL OR cardinality(p_offered_item_ids) < 1 THEN
    RAISE EXCEPTION 'offered_item_ids required';
  END IF;

  SELECT seller_id INTO v_seller FROM public.listings WHERE id = p_requested_item_id AND status = 'live';
  IF v_seller IS NULL THEN
    RAISE EXCEPTION 'Requested listing not found or not live';
  END IF;
  IF v_seller <> v_uid THEN
    RAISE EXCEPTION 'Requested listing must belong to the signed-in user (incoming offer target)';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(p_offered_item_ids) AS x(listing_id)
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.listings l
      WHERE l.id = x.listing_id AND l.seller_id = p_demo_sender_id AND l.status = 'live'
    )
  ) THEN
    RAISE EXCEPTION 'Each offered listing must be a live listing owned by the demo partner';
  END IF;

  v_fee := public.trade_fee_amount_for_tier('cards_slabs'::public.shipping_weight_tier);

  INSERT INTO public.trade_offers (
    sender_id,
    recipient_id,
    requested_item_id,
    offered_item_ids,
    cash_difference,
    message,
    status,
    trade_fee,
    shipping_weight_tier,
    metadata
  ) VALUES (
    p_demo_sender_id,
    v_uid,
    p_requested_item_id,
    p_offered_item_ids,
    0,
    'QA: incoming demo offer (seeded)',
    'awaiting_response'::public.trade_offer_status,
    v_fee,
    'cards_slabs'::public.shipping_weight_tier,
    '{}'::jsonb
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.qa_upsert_mock_shipping_labels(p_trade_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.trade_offers%ROWTYPE;
  v_now date := (timezone('utc', now()))::date;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO t FROM public.trade_offers WHERE id = p_trade_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Trade not found';
  END IF;
  IF auth.uid() NOT IN (t.sender_id, t.recipient_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  DELETE FROM public.shipping_labels
  WHERE trade_id = p_trade_id AND COALESCE(metadata ->> 'qa_mock', '') = 'true';

  INSERT INTO public.shipping_labels (
    trade_id,
    user_id,
    carrier,
    service_level,
    label_url,
    tracking_number,
    tracking_url,
    status,
    ship_by_date,
    cost,
    sender_user_id,
    recipient_user_id,
    metadata
  ) VALUES
  (
    p_trade_id,
    t.sender_id,
    'QA_MOCK',
    'Ground',
    'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
    'QA1TRACK' || substring(t.id::text, 1, 6),
    'https://example.com/track/qa-sender',
    'purchased'::public.shipping_label_status,
    v_now + 3,
    0,
    t.sender_id,
    t.recipient_id,
    jsonb_build_object('qa_mock', true, 'note', 'sender outbound (QA)')
  ),
  (
    p_trade_id,
    t.recipient_id,
    'QA_MOCK',
    'Ground',
    'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
    'QA2TRACK' || substring(t.id::text, 1, 6),
    'https://example.com/track/qa-recipient',
    'purchased'::public.shipping_label_status,
    v_now + 3,
    0,
    t.recipient_id,
    t.sender_id,
    jsonb_build_object('qa_mock', true, 'note', 'recipient outbound (QA)')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.qa_create_incoming_trade_from_demo(uuid, uuid, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.qa_upsert_mock_shipping_labels(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.qa_create_incoming_trade_from_demo(uuid, uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.qa_upsert_mock_shipping_labels(uuid) TO authenticated;

COMMENT ON FUNCTION public.qa_create_incoming_trade_from_demo IS 'QA: insert incoming trade (demo sender → auth user). Requires live listings.';
COMMENT ON FUNCTION public.qa_upsert_mock_shipping_labels IS 'QA: replace qa_mock shipping_labels for both trade parties.';
