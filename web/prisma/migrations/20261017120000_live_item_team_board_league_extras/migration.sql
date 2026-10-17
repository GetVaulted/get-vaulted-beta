-- Optional extra buyable/board spots (MLB, NBA, NHL) on NFL PYT lots (empty by default).
ALTER TABLE "LiveRoomItem" ADD COLUMN IF NOT EXISTS "teamBoardLeagueExtras" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
