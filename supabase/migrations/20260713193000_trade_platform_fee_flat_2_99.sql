-- Flat Get Vaulted trade platform fee: $2.99 per party.
-- Shipping is charged at the actual Shippo label rate (not bundled into this fee).
CREATE OR REPLACE FUNCTION public.trade_fee_amount_for_tier(t public.shipping_weight_tier)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  -- Tier no longer prices the platform fee; argument retained for call-site compatibility.
  RETURN 2.99;
END;
$$;

COMMENT ON FUNCTION public.trade_fee_amount_for_tier(public.shipping_weight_tier) IS
  'Get Vaulted flat trade platform fee ($2.99). Outbound shipping is billed at actual label cost.';
