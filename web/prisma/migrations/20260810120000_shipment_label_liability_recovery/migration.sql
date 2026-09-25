-- Additive-only migration: outstanding shipping liability + recovery audit trail.
-- Does NOT alter, backfill, or delete any existing ShipmentLabelFinance / Order rows.
-- All new columns default to 0/NULL, which is a no-op for every existing row (no historical
-- financial repair is performed by this migration).

ALTER TABLE "ShipmentLabelFinance"
  ADD COLUMN "sellerRecoveredCents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "liabilityEstablishedAt" TIMESTAMP(3),
  ADD COLUMN "writtenOffCents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "writtenOffAt" TIMESTAMP(3),
  ADD COLUMN "writtenOffReason" TEXT,
  ADD COLUMN "writtenOffByAdminId" TEXT;

CREATE INDEX "ShipmentLabelFinance_liabilityEstablishedAt_idx" ON "ShipmentLabelFinance"("liabilityEstablishedAt");

CREATE TYPE "ShipmentLabelLiabilityRecoveryMethod" AS ENUM (
  'payout_offset_stripe',
  'payout_offset_paypal',
  'retry_clawback',
  'manual_admin'
);

CREATE TYPE "ShipmentLabelLiabilityRecoveryOutcome" AS ENUM (
  'recovered',
  'failed',
  'skipped_idempotent'
);

CREATE TABLE "ShipmentLabelLiabilityRecovery" (
    "id" TEXT NOT NULL,
    "shipmentLabelFinanceId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "method" "ShipmentLabelLiabilityRecoveryMethod" NOT NULL,
    "outcome" "ShipmentLabelLiabilityRecoveryOutcome" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "transactionId" TEXT,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShipmentLabelLiabilityRecovery_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ShipmentLabelLiabilityRecovery_shipmentLabelFinanceId_idx" ON "ShipmentLabelLiabilityRecovery"("shipmentLabelFinanceId");
CREATE INDEX "ShipmentLabelLiabilityRecovery_sellerId_idx" ON "ShipmentLabelLiabilityRecovery"("sellerId");
CREATE INDEX "ShipmentLabelLiabilityRecovery_transactionId_idx" ON "ShipmentLabelLiabilityRecovery"("transactionId");
CREATE INDEX "ShipmentLabelLiabilityRecovery_shipmentLabelFinanceId_tran_idx" ON "ShipmentLabelLiabilityRecovery"("shipmentLabelFinanceId", "transactionId");

ALTER TABLE "ShipmentLabelLiabilityRecovery" ADD CONSTRAINT "ShipmentLabelLiabilityRecovery_shipmentLabelFinanceId_fkey" FOREIGN KEY ("shipmentLabelFinanceId") REFERENCES "ShipmentLabelFinance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
