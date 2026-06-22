-- Link drawn giveaways to a fulfillment order (shipping label pipeline).
ALTER TABLE "LiveGiveaway" ADD COLUMN "fulfillmentOrderId" TEXT;

CREATE UNIQUE INDEX "LiveGiveaway_fulfillmentOrderId_key" ON "LiveGiveaway"("fulfillmentOrderId");
