-- Live show tip routing (moderator vs host) and separate tip payment records.

CREATE TYPE "TipRecipientMode" AS ENUM ('host', 'moderator');
CREATE TYPE "LiveTipStatus" AS ENUM ('pending', 'paid', 'failed');

ALTER TYPE "LiveRoomMessageType" ADD VALUE IF NOT EXISTS 'tip';

ALTER TABLE "LiveRoom"
  ADD COLUMN "tipRecipientMode" "TipRecipientMode" NOT NULL DEFAULT 'host',
  ADD COLUMN "tipModeratorId" TEXT;

ALTER TABLE "LiveRoom"
  ADD CONSTRAINT "LiveRoom_tipModeratorId_fkey"
  FOREIGN KEY ("tipModeratorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "LiveRoom_tipModeratorId_idx" ON "LiveRoom"("tipModeratorId");

CREATE TABLE "LiveTip" (
  "id" TEXT NOT NULL,
  "liveRoomId" TEXT NOT NULL,
  "senderId" TEXT NOT NULL,
  "recipientId" TEXT NOT NULL,
  "amountUsd" DOUBLE PRECISION NOT NULL,
  "message" TEXT NOT NULL DEFAULT '',
  "status" "LiveTipStatus" NOT NULL DEFAULT 'pending',
  "stripeCheckoutSessionId" TEXT,
  "stripePaymentIntentId" TEXT,
  "paidAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "LiveTip_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "LiveTip"
  ADD CONSTRAINT "LiveTip_liveRoomId_fkey"
  FOREIGN KEY ("liveRoomId") REFERENCES "LiveRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LiveTip"
  ADD CONSTRAINT "LiveTip_senderId_fkey"
  FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LiveTip"
  ADD CONSTRAINT "LiveTip_recipientId_fkey"
  FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "LiveTip_liveRoomId_createdAt_idx" ON "LiveTip"("liveRoomId", "createdAt");
CREATE INDEX "LiveTip_recipientId_createdAt_idx" ON "LiveTip"("recipientId", "createdAt");
CREATE INDEX "LiveTip_senderId_createdAt_idx" ON "LiveTip"("senderId", "createdAt");
