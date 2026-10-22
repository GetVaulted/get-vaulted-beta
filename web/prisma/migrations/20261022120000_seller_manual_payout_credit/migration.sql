-- Admin-added money in a seller's Stripe balance that the seller can pay out themselves
-- (additive: new table only). Remaining credit = amountCents - usedCents.
CREATE TABLE IF NOT EXISTS "SellerManualPayoutCredit" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "createdByAdminId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "usedCents" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "stripeTransferId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SellerManualPayoutCredit_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SellerManualPayoutCredit_amount_chk" CHECK ("amountCents" > 0 AND "usedCents" >= 0 AND "usedCents" <= "amountCents")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SellerManualPayoutCredit_stripeTransferId_key"
    ON "SellerManualPayoutCredit"("stripeTransferId");

CREATE INDEX IF NOT EXISTS "SellerManualPayoutCredit_sellerId_createdAt_idx"
    ON "SellerManualPayoutCredit"("sellerId", "createdAt");

DO $$ BEGIN
    ALTER TABLE "SellerManualPayoutCredit"
        ADD CONSTRAINT "SellerManualPayoutCredit_sellerId_fkey"
        FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "SellerManualPayoutCredit"
        ADD CONSTRAINT "SellerManualPayoutCredit_createdByAdminId_fkey"
        FOREIGN KEY ("createdByAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "SellerManualPayoutCredit" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "SellerManualPayoutCredit" FROM anon, authenticated;
