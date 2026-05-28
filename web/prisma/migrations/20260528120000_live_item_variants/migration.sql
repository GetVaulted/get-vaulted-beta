-- Live item variant / spot selection (master item + selectable options)

CREATE TYPE "LiveItemSalesFormat" AS ENUM ('auction', 'buy_now', 'variant_selection', 'team_break');
CREATE TYPE "LiveItemVariantStatus" AS ENUM ('available', 'reserved', 'sold_out');
CREATE TYPE "LiveItemVariantPurchaseStatus" AS ENUM ('pending_payment', 'paid', 'failed', 'cancelled');

ALTER TABLE "LiveRoomItem" ADD COLUMN "salesFormat" "LiveItemSalesFormat" NOT NULL DEFAULT 'auction';

CREATE TABLE "LiveItemVariant" (
    "id" TEXT NOT NULL,
    "liveRoomItemId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "priceUsd" DOUBLE PRECISION NOT NULL,
    "quantityInitial" INTEGER NOT NULL DEFAULT 1,
    "quantityRemaining" INTEGER NOT NULL DEFAULT 1,
    "soldCount" INTEGER NOT NULL DEFAULT 0,
    "isHot" BOOLEAN NOT NULL DEFAULT false,
    "imageUrl" TEXT NOT NULL DEFAULT '',
    "color" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" "LiveItemVariantStatus" NOT NULL DEFAULT 'available',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LiveItemVariant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LiveItemVariantPurchase" (
    "id" TEXT NOT NULL,
    "liveRoomId" TEXT NOT NULL,
    "liveRoomItemId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPriceUsd" DOUBLE PRECISION NOT NULL,
    "totalUsd" DOUBLE PRECISION NOT NULL,
    "paymentStatus" "LiveItemVariantPurchaseStatus" NOT NULL DEFAULT 'pending_payment',
    "idempotencyKey" TEXT,
    "stripeCheckoutSessionId" TEXT,
    "stripePaymentIntentId" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LiveItemVariantPurchase_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LiveItemVariant_liveRoomItemId_label_key" ON "LiveItemVariant"("liveRoomItemId", "label");
CREATE INDEX "LiveItemVariant_liveRoomItemId_sortOrder_idx" ON "LiveItemVariant"("liveRoomItemId", "sortOrder");

CREATE UNIQUE INDEX "LiveItemVariantPurchase_idempotencyKey_key" ON "LiveItemVariantPurchase"("idempotencyKey");
CREATE INDEX "LiveItemVariantPurchase_variantId_paymentStatus_idx" ON "LiveItemVariantPurchase"("variantId", "paymentStatus");
CREATE INDEX "LiveItemVariantPurchase_liveRoomId_createdAt_idx" ON "LiveItemVariantPurchase"("liveRoomId", "createdAt");
CREATE INDEX "LiveItemVariantPurchase_buyerId_createdAt_idx" ON "LiveItemVariantPurchase"("buyerId", "createdAt");

ALTER TABLE "LiveItemVariant" ADD CONSTRAINT "LiveItemVariant_liveRoomItemId_fkey" FOREIGN KEY ("liveRoomItemId") REFERENCES "LiveRoomItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LiveItemVariantPurchase" ADD CONSTRAINT "LiveItemVariantPurchase_liveRoomId_fkey" FOREIGN KEY ("liveRoomId") REFERENCES "LiveRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LiveItemVariantPurchase" ADD CONSTRAINT "LiveItemVariantPurchase_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "LiveItemVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LiveItemVariantPurchase" ADD CONSTRAINT "LiveItemVariantPurchase_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
