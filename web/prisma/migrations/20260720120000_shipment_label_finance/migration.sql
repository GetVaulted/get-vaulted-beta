-- Additive-only migration: creates ShipmentLabelFinance ledger.
-- Does NOT alter or delete existing Order / ShipmentPackage rows.
-- Safe for databases that already have paid/labeled orders.

CREATE TYPE "ShipmentLabelFinancePurpose" AS ENUM ('initial', 'replacement', 'additional_package');

CREATE TYPE "ShipmentLabelFinanceStatus" AS ENUM (
  'active',
  'replaced',
  'void_pending',
  'voided',
  'refund_pending',
  'refunded',
  'failed_purchase'
);

CREATE TABLE "ShipmentLabelFinance" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "liveShippingSessionId" TEXT,
    "shipmentPackageId" TEXT,
    "shippoTransactionId" TEXT NOT NULL,
    "shippoShipmentId" TEXT,
    "labelCostCents" INTEGER NOT NULL,
    "quotedLabelCostCents" INTEGER,
    "purpose" "ShipmentLabelFinancePurpose" NOT NULL DEFAULT 'initial',
    "replacesShippoTransactionId" TEXT,
    "status" "ShipmentLabelFinanceStatus" NOT NULL DEFAULT 'active',
    "sellerClawbackCents" INTEGER NOT NULL DEFAULT 0,
    "sellerClawbackReversalId" TEXT,
    "sellerCreditCents" INTEGER NOT NULL DEFAULT 0,
    "sellerCreditTransferId" TEXT,
    "clawbackIdempotencyKey" TEXT,
    "creditIdempotencyKey" TEXT,
    "repairCreditIdempotencyKey" TEXT,
    "shippoStatus" TEXT,
    "shippoObjectState" TEXT,
    "shippoMessagesJson" JSONB,
    "clawbackFailedAt" TIMESTAMP(3),
    "clawbackFailureDetail" TEXT,
    "creditFailedAt" TIMESTAMP(3),
    "creditFailureDetail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShipmentLabelFinance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ShipmentLabelFinance_shipmentPackageId_key" ON "ShipmentLabelFinance"("shipmentPackageId");
CREATE UNIQUE INDEX "ShipmentLabelFinance_orderId_shippoTransactionId_key" ON "ShipmentLabelFinance"("orderId", "shippoTransactionId");
CREATE INDEX "ShipmentLabelFinance_orderId_idx" ON "ShipmentLabelFinance"("orderId");
CREATE INDEX "ShipmentLabelFinance_orderId_status_idx" ON "ShipmentLabelFinance"("orderId", "status");
CREATE INDEX "ShipmentLabelFinance_shippoTransactionId_idx" ON "ShipmentLabelFinance"("shippoTransactionId");
CREATE INDEX "ShipmentLabelFinance_replacesShippoTransactionId_idx" ON "ShipmentLabelFinance"("replacesShippoTransactionId");
CREATE INDEX "ShipmentLabelFinance_sellerClawbackReversalId_idx" ON "ShipmentLabelFinance"("sellerClawbackReversalId");
CREATE INDEX "ShipmentLabelFinance_sellerCreditTransferId_idx" ON "ShipmentLabelFinance"("sellerCreditTransferId");
CREATE INDEX "ShipmentLabelFinance_repairCreditIdempotencyKey_idx" ON "ShipmentLabelFinance"("repairCreditIdempotencyKey");

ALTER TABLE "ShipmentLabelFinance" ADD CONSTRAINT "ShipmentLabelFinance_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShipmentLabelFinance" ADD CONSTRAINT "ShipmentLabelFinance_shipmentPackageId_fkey" FOREIGN KEY ("shipmentPackageId") REFERENCES "ShipmentPackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
