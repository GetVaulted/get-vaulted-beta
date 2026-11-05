-- Surprise Sets: seller-set limit on ounces per shipping label.
ALTER TABLE "LiveRoomItem" ADD COLUMN IF NOT EXISTS "maxLabelWeightOz" DOUBLE PRECISION;
