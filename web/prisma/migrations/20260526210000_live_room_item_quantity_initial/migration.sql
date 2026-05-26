-- Preserve original multi-unit total while `quantity` tracks remaining units.
ALTER TABLE "LiveRoomItem" ADD COLUMN "quantityInitial" INTEGER NOT NULL DEFAULT 1;

UPDATE "LiveRoomItem"
SET "quantityInitial" = GREATEST(COALESCE("quantity", 1), 1);
