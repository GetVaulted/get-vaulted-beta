-- Shippo-ready shipping_labels + optional link to marketplace orders

ALTER TABLE public.shipping_labels
  ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES public.orders (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS shippo_shipment_id TEXT,
  ADD COLUMN IF NOT EXISTS shippo_transaction_id TEXT,
  ADD COLUMN IF NOT EXISTS service_level TEXT,
  ADD COLUMN IF NOT EXISTS tracking_url TEXT,
  ADD COLUMN IF NOT EXISTS estimated_delivery TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cost NUMERIC(14, 4),
  ADD COLUMN IF NOT EXISTS package_dimensions JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS insured_value NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS weight_tier public.shipping_weight_tier,
  ADD COLUMN IF NOT EXISTS sender_user_id UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recipient_user_id UUID REFERENCES public.profiles (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS shipping_labels_order_idx ON public.shipping_labels (order_id);
CREATE INDEX IF NOT EXISTS shipping_labels_shippo_tx_idx ON public.shipping_labels (shippo_transaction_id);

COMMENT ON COLUMN public.shipping_labels.shippo_shipment_id IS 'Shippo Shipment object_id';
COMMENT ON COLUMN public.shipping_labels.shippo_transaction_id IS 'Shippo Transaction object_id (label purchase)';
COMMENT ON COLUMN public.shipping_labels.package_dimensions IS 'JSON: length, width, height, distance_unit';

-- Order participants can read labels tied to their order
CREATE POLICY "Order participants read shipping labels"
  ON public.shipping_labels FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = shipping_labels.order_id
        AND (o.buyer_id = auth.uid() OR o.seller_id = auth.uid())
    )
  );
