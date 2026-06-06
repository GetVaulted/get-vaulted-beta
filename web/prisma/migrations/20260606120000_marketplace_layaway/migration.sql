-- AlterEnum
ALTER TYPE "ListingStatus" ADD VALUE IF NOT EXISTS 'layaway_reserved';

-- CreateEnum
CREATE TYPE "LayawayPlanType" AS ENUM ('thirty_day', 'sixty_day');
CREATE TYPE "LayawayStatus" AS ENUM ('active', 'paid_off', 'defaulted', 'refunded', 'completed');
CREATE TYPE "LayawayPaymentKind" AS ENUM ('deposit', 'installment', 'balance_payoff');

-- AlterEnum
ALTER TYPE "OrderPaymentMethod" ADD VALUE IF NOT EXISTS 'layaway';

-- AlterTable
ALTER TABLE "Listing" ADD COLUMN IF NOT EXISTS "allowLayaway" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Layaway" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "planType" "LayawayPlanType" NOT NULL,
    "status" "LayawayStatus" NOT NULL DEFAULT 'active',
    "originalPriceUsd" DOUBLE PRECISION NOT NULL,
    "shippingPriceUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "depositAmountUsd" DOUBLE PRECISION NOT NULL,
    "amountPaidUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "remainingBalanceUsd" DOUBLE PRECISION NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "defaultedAt" TIMESTAMP(3),
    "termsAcknowledgedAt" TIMESTAMP(3) NOT NULL,
    "lastReminderDay" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Layaway_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LayawayPayment" (
    "id" TEXT NOT NULL,
    "layawayId" TEXT NOT NULL,
    "amountUsd" DOUBLE PRECISION NOT NULL,
    "kind" "LayawayPaymentKind" NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "stripeCheckoutSessionId" TEXT,
    "stripePaymentIntentId" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LayawayPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LayawayAuditLog" (
    "id" TEXT NOT NULL,
    "layawayId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorUserId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LayawayAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Layaway_listingId_key" ON "Layaway"("listingId");
CREATE UNIQUE INDEX "Layaway_orderId_key" ON "Layaway"("orderId");
CREATE INDEX "Layaway_buyerId_status_idx" ON "Layaway"("buyerId", "status");
CREATE INDEX "Layaway_sellerId_status_idx" ON "Layaway"("sellerId", "status");
CREATE INDEX "Layaway_status_dueAt_idx" ON "Layaway"("status", "dueAt");
CREATE INDEX "LayawayPayment_layawayId_createdAt_idx" ON "LayawayPayment"("layawayId", "createdAt");
CREATE INDEX "LayawayPayment_stripeCheckoutSessionId_idx" ON "LayawayPayment"("stripeCheckoutSessionId");
CREATE INDEX "LayawayPayment_stripePaymentIntentId_idx" ON "LayawayPayment"("stripePaymentIntentId");
CREATE INDEX "LayawayAuditLog_layawayId_createdAt_idx" ON "LayawayAuditLog"("layawayId", "createdAt");

-- AddForeignKey
ALTER TABLE "Layaway" ADD CONSTRAINT "Layaway_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Layaway" ADD CONSTRAINT "Layaway_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Layaway" ADD CONSTRAINT "Layaway_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Layaway" ADD CONSTRAINT "Layaway_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LayawayPayment" ADD CONSTRAINT "LayawayPayment_layawayId_fkey" FOREIGN KEY ("layawayId") REFERENCES "Layaway"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LayawayAuditLog" ADD CONSTRAINT "LayawayAuditLog_layawayId_fkey" FOREIGN KEY ("layawayId") REFERENCES "Layaway"("id") ON DELETE CASCADE ON UPDATE CASCADE;
