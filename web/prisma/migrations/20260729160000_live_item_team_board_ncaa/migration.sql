-- Optional NCAA buyable/board spot on NFL PYT lots (off by default).
ALTER TABLE "LiveRoomItem" ADD COLUMN IF NOT EXISTS "teamBoardNcaa" BOOLEAN NOT NULL DEFAULT false;
