-- Single queue row can represent multiple units (shown as quantity on one tile).
ALTER TABLE "LiveRoomItem" ADD COLUMN "quantity" INTEGER NOT NULL DEFAULT 1;
