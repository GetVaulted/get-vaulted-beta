-- AlterTable User: seller payout rail preference + PayPal identity
ALTER TABLE "User" ADD COLUMN "preferredSellerPayoutProcessor" "SellerPayoutProcessor" NOT NULL DEFAULT 'STRIPE';
ALTER TABLE "User" ADD COLUMN "paypalPayoutEmail" TEXT;
ALTER TABLE "User" ADD COLUMN "paypalPayoutVerifiedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "paypalMerchantId" TEXT;

-- AlterTable Order: PayPal payout fee + async status
ALTER TABLE "Order" ADD COLUMN "paypalPayoutFeeCents" INTEGER;
ALTER TABLE "Order" ADD COLUMN "paypalPayoutStatus" TEXT;

-- CreateTable
CREATE TABLE "ProcessedPayPalEvent" (
    "id" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedPayPalEvent_pkey" PRIMARY KEY ("id")
);
