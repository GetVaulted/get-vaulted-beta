-- Refund/return/dispute safety audit (2026-07), part 1/2.
--
-- New intermediate status: a Stripe refund has been initiated (durable idempotency-key record)
-- but the DB has not yet confirmed the final `refunded` state. Lets `executeOrderRefund` record
-- "refund initiated" BEFORE calling Stripe, so a DB failure after a successful Stripe call never
-- leaves zero local trace that money moved. See `OrderRefundRequestStatus` doc comment.
--
-- Kept in its own migration/transaction: Postgres does not allow a newly added enum value to be
-- referenced (e.g. in a later index predicate) within the same transaction that added it.
ALTER TYPE "OrderRefundRequestStatus" ADD VALUE IF NOT EXISTS 'refund_processing';
