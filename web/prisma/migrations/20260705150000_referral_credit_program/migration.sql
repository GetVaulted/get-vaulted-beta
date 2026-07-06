-- Referral credit program (2026-07): the "Referral Credit" row in the buyer wallet has always
-- shown a hardcoded $0.00 with no backend behind it. This adds real attribution + a credit
-- ledger. See `web/src/lib/referral-credit.ts` for the full program rules (flat $10/$10 on the
-- referred friend's first $25+ paid order, pure marketing expense — never touches seller payout
-- or platform fee, held until the source order's return/dispute window clears, self-referral
-- blocked, one referral attribution per account for life).

-- Referral attribution — set once at account creation, immutable afterward.
ALTER TABLE "User" ADD COLUMN "referredById" TEXT;
ALTER TABLE "User" ADD COLUMN "referredAt" TIMESTAMP(3);

CREATE INDEX "User_referredById_idx" ON "User"("referredById");

ALTER TABLE "User" ADD CONSTRAINT "User_referredById_fkey" FOREIGN KEY ("referredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TYPE "ReferralCreditRole" AS ENUM ('referrer', 'referee');

CREATE TYPE "ReferralCreditStatus" AS ENUM ('pending', 'available', 'reserved', 'spent', 'voided');

CREATE TABLE "ReferralCredit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ReferralCreditRole" NOT NULL,
    "amountUsd" DOUBLE PRECISION NOT NULL,
    "status" "ReferralCreditStatus" NOT NULL DEFAULT 'pending',
    "sourceOrderId" TEXT NOT NULL,
    "availableAt" TIMESTAMP(3) NOT NULL,
    "reservedForRef" TEXT,
    "reservedAt" TIMESTAMP(3),
    "spentOrderId" TEXT,
    "spentAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReferralCredit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReferralCredit_sourceOrderId_role_key" ON "ReferralCredit"("sourceOrderId", "role");

CREATE INDEX "ReferralCredit_userId_status_idx" ON "ReferralCredit"("userId", "status");

CREATE INDEX "ReferralCredit_status_availableAt_idx" ON "ReferralCredit"("status", "availableAt");

ALTER TABLE "ReferralCredit" ADD CONSTRAINT "ReferralCredit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReferralCredit" ADD CONSTRAINT "ReferralCredit_sourceOrderId_fkey" FOREIGN KEY ("sourceOrderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
