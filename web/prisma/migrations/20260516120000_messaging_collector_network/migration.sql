-- CreateEnum
CREATE TYPE "MessageConversationKind" AS ENUM ('buyer_seller', 'offer_negotiation', 'order_support', 'trade', 'live_networking', 'system');
CREATE TYPE "MessageThreadInbox" AS ENUM ('primary', 'request');
CREATE TYPE "MessageKind" AS ENUM ('user', 'system');

-- AlterTable MessageThread
ALTER TABLE "MessageThread" ADD COLUMN "anchorKey" TEXT NOT NULL DEFAULT '';
ALTER TABLE "MessageThread" ADD COLUMN "conversationKind" "MessageConversationKind" NOT NULL DEFAULT 'buyer_seller';
ALTER TABLE "MessageThread" ADD COLUMN "inbox" "MessageThreadInbox" NOT NULL DEFAULT 'primary';
ALTER TABLE "MessageThread" ADD COLUMN "offerId" TEXT;
ALTER TABLE "MessageThread" ADD COLUMN "orderId" TEXT;
ALTER TABLE "MessageThread" ADD COLUMN "liveRoomId" TEXT;

UPDATE "MessageThread" SET "anchorKey" = 'listing:' || "listingId" WHERE "anchorKey" = '';

-- Drop old unique, add new
DROP INDEX IF EXISTS "MessageThread_buyerId_sellerId_listingId_key";
CREATE UNIQUE INDEX "MessageThread_buyerId_sellerId_anchorKey_key" ON "MessageThread"("buyerId", "sellerId", "anchorKey");
CREATE INDEX "MessageThread_buyerId_inbox_updatedAt_idx" ON "MessageThread"("buyerId", "inbox", "updatedAt");
CREATE INDEX "MessageThread_sellerId_inbox_updatedAt_idx" ON "MessageThread"("sellerId", "inbox", "updatedAt");

-- AlterTable Message
ALTER TABLE "Message" ADD COLUMN "kind" "MessageKind" NOT NULL DEFAULT 'user';
ALTER TABLE "Message" ADD COLUMN "systemEvent" TEXT;
CREATE INDEX "Message_threadId_createdAt_idx" ON "Message"("threadId", "createdAt");

-- CreateTable MessageThreadParticipant
CREATE TABLE "MessageThreadParticipant" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pinnedAt" TIMESTAMP(3),
    "starred" BOOLEAN NOT NULL DEFAULT false,
    "muted" BOOLEAN NOT NULL DEFAULT false,
    "blocked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageThreadParticipant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MessageThreadParticipant_threadId_userId_key" ON "MessageThreadParticipant"("threadId", "userId");
CREATE INDEX "MessageThreadParticipant_userId_idx" ON "MessageThreadParticipant"("userId");

ALTER TABLE "MessageThreadParticipant" ADD CONSTRAINT "MessageThreadParticipant_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "MessageThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MessageThreadParticipant" ADD CONSTRAINT "MessageThreadParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
