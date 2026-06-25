-- Migration 2: Lock legacy public.orders and public.payments to server writes only.
-- Netlify functions / service role retain access. Client SELECT policies unchanged.

DROP POLICY IF EXISTS "Buyers create orders" ON public.orders;
DROP POLICY IF EXISTS "Participants update own orders" ON public.orders;
DROP POLICY IF EXISTS "Users insert own pending payments" ON public.payments;

REVOKE INSERT, UPDATE, DELETE ON public.orders FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.payments FROM authenticated;
