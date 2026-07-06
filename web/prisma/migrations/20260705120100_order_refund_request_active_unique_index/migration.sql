-- Refund/return/dispute safety audit (2026-07), part 2/2.
--
-- Partial unique index: only one "active" (in-flight) refund/return request may exist per order
-- at a time. Closes a race where two concurrent requests could both pass an application-level
-- "no active request" check before either row was written (see `createBuyerRefundRequest` /
-- `sellerDirectCancelRefund`). Enforced independently of, and in addition to, the
-- application-level `getActiveRefundRequest` + serializable-transaction check, as defense in
-- depth against any caller (including future ones) that forgets that check.
CREATE UNIQUE INDEX IF NOT EXISTS "OrderRefundRequest_orderId_active_unique"
ON "OrderRefundRequest" ("orderId")
WHERE "status" IN (
  'pending_seller',
  'seller_denied',
  'escalated',
  'awaiting_return',
  'return_in_transit',
  'refund_processing'
);
