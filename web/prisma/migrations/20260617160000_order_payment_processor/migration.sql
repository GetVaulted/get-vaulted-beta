-- CreateEnum
CREATE TYPE "PaymentProcessor" AS ENUM ('STRIPE', 'PAYPAL_VENMO');

-- CreateEnum
CREATE TYPE "WalletPaymentMethodType" AS ENUM ('card', 'apple_pay', 'google_pay', 'link', 'cash_app_pay', 'paypal', 'venmo');

-- CreateEnum
CREATE TYPE "SellerPayoutProcessor" AS ENUM ('STRIPE', 'PAYPAL');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "paymentProcessor" "PaymentProcessor" NOT NULL DEFAULT 'STRIPE';
ALTER TABLE "Order" ADD COLUMN "walletPaymentMethodType" "WalletPaymentMethodType" NOT NULL DEFAULT 'card';
ALTER TABLE "Order" ADD COLUMN "processorPaymentId" TEXT;
ALTER TABLE "Order" ADD COLUMN "processorCustomerId" TEXT;
ALTER TABLE "Order" ADD COLUMN "processorTransferId" TEXT;
ALTER TABLE "Order" ADD COLUMN "sellerPayoutProcessor" "SellerPayoutProcessor" NOT NULL DEFAULT 'STRIPE';
ALTER TABLE "Order" ADD COLUMN "walletPaymentMethodId" TEXT;
