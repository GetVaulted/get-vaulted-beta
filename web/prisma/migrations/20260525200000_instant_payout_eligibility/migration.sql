-- CreateEnum
CREATE TYPE "InstantPayoutStatus" AS ENUM ('eligible', 'ineligible', 'suspended', 'admin_override');

-- CreateEnum
CREATE TYPE "PayoutRiskLevel" AS ENUM ('low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "OrderPayoutStatus" AS ENUM ('pending', 'held', 'delivery_confirmed', 'instant_payout_ready', 'paid_out', 'blocked', 'manual_review');

-- CreateEnum
CREATE TYPE "OrderPayoutMethod" AS ENUM ('standard', 'instant_after_delivery');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "instantPayoutEligible" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "instantPayoutStatus" "InstantPayoutStatus" NOT NULL DEFAULT 'ineligible',
ADD COLUMN     "instantPayoutOverrideByAdmin" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "instantPayoutOverrideReason" TEXT,
ADD COLUMN     "instantPayoutOverrideAdminId" TEXT,
ADD COLUMN     "instantPayoutOverrideAt" TIMESTAMP(3),
ADD COLUMN     "payoutRiskLevel" "PayoutRiskLevel" NOT NULL DEFAULT 'medium',
ADD COLUMN     "payoutHoldDays" INTEGER NOT NULL DEFAULT 7,
ADD COLUMN     "payoutReservePercent" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "payoutStatus" "OrderPayoutStatus" NOT NULL DEFAULT 'pending',
ADD COLUMN     "deliveryConfirmedAt" TIMESTAMP(3),
ADD COLUMN     "payoutEligibleAt" TIMESTAMP(3),
ADD COLUMN     "payoutReleasedAt" TIMESTAMP(3),
ADD COLUMN     "payoutBlockedReason" TEXT,
ADD COLUMN     "payoutMethod" "OrderPayoutMethod" NOT NULL DEFAULT 'standard',
ADD COLUMN     "payoutReserveAmountCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "payoutHoldUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "PayoutEligibilityAuditLog" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "orderId" TEXT,
    "adminId" TEXT,
    "action" TEXT NOT NULL,
    "previousStatus" TEXT,
    "newStatus" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayoutEligibilityAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PayoutEligibilityAuditLog_sellerId_createdAt_idx" ON "PayoutEligibilityAuditLog"("sellerId", "createdAt");

-- CreateIndex
CREATE INDEX "PayoutEligibilityAuditLog_orderId_createdAt_idx" ON "PayoutEligibilityAuditLog"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "Order_sellerId_payoutStatus_idx" ON "Order"("sellerId", "payoutStatus");

-- AddForeignKey
ALTER TABLE "PayoutEligibilityAuditLog" ADD CONSTRAINT "PayoutEligibilityAuditLog_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutEligibilityAuditLog" ADD CONSTRAINT "PayoutEligibilityAuditLog_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
