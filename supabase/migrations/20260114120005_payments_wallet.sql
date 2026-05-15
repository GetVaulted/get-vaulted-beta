-- Stripe-oriented payments, payouts, wallet ledger

CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  amount_cents BIGINT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'usd',
  kind public.payment_kind NOT NULL,
  status public.payment_status NOT NULL DEFAULT 'pending',
  stripe_checkout_session_id TEXT,
  stripe_payment_intent_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX payments_user_idx ON public.payments (user_id, created_at DESC);
CREATE INDEX payments_stripe_pi_idx ON public.payments (stripe_payment_intent_id);

CREATE TRIGGER payments_set_updated_at
BEFORE UPDATE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL DEFAULT 'usd',
  status public.payout_status NOT NULL DEFAULT 'pending',
  stripe_payout_id TEXT,
  stripe_connect_account_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX payouts_seller_idx ON public.payouts (seller_id, created_at DESC);

CREATE TRIGGER payouts_set_updated_at
BEFORE UPDATE ON public.payouts
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.wallet_balances (
  user_id UUID PRIMARY KEY REFERENCES public.profiles (id) ON DELETE CASCADE,
  balance_cents BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  amount_cents BIGINT NOT NULL,
  balance_after_cents BIGINT NOT NULL,
  kind public.wallet_tx_kind NOT NULL,
  reference_type TEXT,
  reference_id UUID,
  description TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX wallet_tx_user_idx ON public.wallet_transactions (user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- RLS: payments / payouts / wallet (own records only for clients)
-- ---------------------------------------------------------------------------
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own payments"
  ON public.payments FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Writes via service role / Netlify webhook in production; optional insert for checkout start:
CREATE POLICY "Users insert own pending payments"
  ON public.payments FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() AND status = 'pending');

ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sellers read own payouts"
  ON public.payouts FOR SELECT
  TO authenticated
  USING (seller_id = auth.uid());

ALTER TABLE public.wallet_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own wallet balance"
  ON public.wallet_balances FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own wallet transactions"
  ON public.wallet_transactions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());
