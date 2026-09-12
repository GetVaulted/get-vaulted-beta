-- AlterTable
ALTER TABLE "Order" ADD COLUMN "stripeTransferId" TEXT;
ALTER TABLE "Order" ADD COLUMN "shippingLabelCostReversalId" TEXT;
ALTER TABLE "Order" ADD COLUMN "shippingLabelCostChargedShippoTransactionId" TEXT;
ALTER TABLE "Order" ADD COLUMN "shippingLabelCostReversedCents" INTEGER NOT NULL DEFAULT 0;
