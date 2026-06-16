-- Live room moderator tools: levels, extended actions, seller stream bans

CREATE TYPE "LiveRoomModeratorLevel" AS ENUM ('chat', 'show', 'break', 'head');

ALTER TYPE "LiveRoomModerationActionType" ADD VALUE 'timeout';
ALTER TYPE "LiveRoomModerationActionType" ADD VALUE 'seller_stream_ban';
ALTER TYPE "LiveRoomModerationActionType" ADD VALUE 'post_announcement';
ALTER TYPE "LiveRoomModerationActionType" ADD VALUE 'run_giveaway';

ALTER TABLE "LiveRoomModerator" ADD COLUMN "moderatorLevel" "LiveRoomModeratorLevel" NOT NULL DEFAULT 'chat';

ALTER TABLE "LiveRoomModerationAction" ADD COLUMN "sellerId" TEXT;
ALTER TABLE "LiveRoomModerationAction" ADD CONSTRAINT "LiveRoomModerationAction_sellerId_fkey"
  FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "LiveRoomModerationAction_sellerId_createdAt_idx" ON "LiveRoomModerationAction"("sellerId", "createdAt");

CREATE TABLE "SellerStreamBan" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "bannedByUserId" TEXT NOT NULL,
    "liveRoomId" TEXT,
    "reason" TEXT NOT NULL DEFAULT '',
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SellerStreamBan_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "SellerStreamBan" ADD CONSTRAINT "SellerStreamBan_sellerId_fkey"
  FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SellerStreamBan" ADD CONSTRAINT "SellerStreamBan_targetUserId_fkey"
  FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SellerStreamBan" ADD CONSTRAINT "SellerStreamBan_bannedByUserId_fkey"
  FOREIGN KEY ("bannedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SellerStreamBan" ADD CONSTRAINT "SellerStreamBan_liveRoomId_fkey"
  FOREIGN KEY ("liveRoomId") REFERENCES "LiveRoom"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "SellerStreamBan_sellerId_targetUserId_revokedAt_idx" ON "SellerStreamBan"("sellerId", "targetUserId", "revokedAt");
CREATE INDEX "SellerStreamBan_targetUserId_revokedAt_idx" ON "SellerStreamBan"("targetUserId", "revokedAt");
