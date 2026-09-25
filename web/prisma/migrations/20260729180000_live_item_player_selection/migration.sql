-- Pick Your Player: sales format + custom random pool labels.
ALTER TYPE "LiveItemSalesFormat" ADD VALUE IF NOT EXISTS 'player_selection';
ALTER TABLE "LiveRoomItem" ADD COLUMN IF NOT EXISTS "customRandomPoolLabels" JSONB;
