-- Admin-recorded partial PayPal payouts to a seller (additive: new table only).
-- A row means "I already sent this seller part of what they're owed, off-platform".
-- Open rows (settledAt IS NULL, voidedAt IS NULL) reduce the seller's remaining balance.
CREATE TABLE IF NOT EXISTS "SellerPayPalPartialPayment" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "note" TEXT,
    "adminId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),

    CONSTRAINT "SellerPayPalPartialPayment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SellerPayPalPartialPayment_sellerId_settledAt_voidedAt_idx"
    ON "SellerPayPalPartialPayment"("sellerId", "settledAt", "voidedAt");

ALTER TABLE "SellerPayPalPartialPayment" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "SellerPayPalPartialPayment" FROM anon, authenticated;
