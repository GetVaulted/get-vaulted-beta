-- Live queue item auction pricing (starting bid, increment, reserve, buy-now already on priceUsd)
ALTER TABLE "LiveRoomItem" ADD COLUMN IF NOT EXISTS "bidIncrementUsd" DOUBLE PRECISION;
ALTER TABLE "LiveRoomItem" ADD COLUMN IF NOT EXISTS "reservePriceUsd" DOUBLE PRECISION;
