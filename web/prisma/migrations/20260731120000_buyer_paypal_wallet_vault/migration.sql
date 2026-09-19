-- Buyer PayPal Wallet vault fields (mirror Venmo; live off-session charges).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "paypalWalletPaymentTokenId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "paypalWalletEmail" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "paypalWalletVaultedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "paypalPendingSetupTokenId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "paypalPendingSetupNonce" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "paypalPendingSetupMobile" BOOLEAN NOT NULL DEFAULT false;
