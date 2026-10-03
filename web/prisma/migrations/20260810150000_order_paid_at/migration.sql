-- Additive only: nullable payment-date column + provenance tag for financial reconciliation.
-- Backfilled separately (see the paidAt backfill job) — this migration does not populate either
-- column. paidAtSource distinguishes a real Stripe Charge.created value (stripe_authoritative)
-- from a createdAt-copied stand-in (created_at_fallback) so reconciliation reports never mistake
-- an unverified timestamp for Stripe-confirmed data.

-- CreateEnum
CREATE TYPE "OrderPaidAtSource" AS ENUM ('stripe_authoritative', 'created_at_fallback');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "paidAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "paidAtSource" "OrderPaidAtSource";

CREATE INDEX "Order_paidAt_idx" ON "Order"("paidAt");
CREATE INDEX "Order_paidAtSource_idx" ON "Order"("paidAtSource");
