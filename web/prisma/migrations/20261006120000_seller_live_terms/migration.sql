-- Seller live-content terms (Terms §7.1): record which version a seller accepted. Additive only.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "sellerTermsVersion" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "sellerTermsAcceptedAt" TIMESTAMP(3);
