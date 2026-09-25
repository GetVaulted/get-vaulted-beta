-- Buyer Venmo vault (PayPal Payment Method Tokens) + preferred wallet method
ALTER TABLE "User" ADD COLUMN "paypalBuyerCustomerId" TEXT;
ALTER TABLE "User" ADD COLUMN "venmoPaymentTokenId" TEXT;
ALTER TABLE "User" ADD COLUMN "venmoUsername" TEXT;
ALTER TABLE "User" ADD COLUMN "venmoVaultedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "venmoPendingSetupTokenId" TEXT;
ALTER TABLE "User" ADD COLUMN "venmoPendingSetupNonce" TEXT;
ALTER TABLE "User" ADD COLUMN "venmoPendingSetupMobile" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "buyerDefaultWalletPaymentMethodId" TEXT;
