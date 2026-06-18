-- CreateEnum
CREATE TYPE "LiveGiveawayKind" AS ENUM ('open', 'buyers');

-- CreateEnum
CREATE TYPE "LiveGiveawayStatus" AS ENUM ('draft', 'entries_open', 'entries_closed', 'drawn', 'cancelled');

-- CreateEnum
CREATE TYPE "LiveGiveawayEntryMethod" AS ENUM ('watch_enter', 'purchase', 'amoe_form');

-- CreateTable
CREATE TABLE "LiveGiveaway" (
    "id" TEXT NOT NULL,
    "liveRoomId" TEXT NOT NULL,
    "kind" "LiveGiveawayKind" NOT NULL,
    "title" TEXT NOT NULL,
    "prizeDescription" TEXT NOT NULL DEFAULT '',
    "imageUrl" TEXT NOT NULL DEFAULT '',
    "rulesText" TEXT NOT NULL DEFAULT '',
    "amoeRulesSlug" TEXT,
    "status" "LiveGiveawayStatus" NOT NULL DEFAULT 'draft',
    "entryOpenAt" TIMESTAMP(3),
    "entryCloseAt" TIMESTAMP(3),
    "drawnAt" TIMESTAMP(3),
    "winnerUserId" TEXT,
    "drawSeed" TEXT,
    "entryCount" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LiveGiveaway_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveGiveawayEntry" (
    "id" TEXT NOT NULL,
    "giveawayId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "method" "LiveGiveawayEntryMethod" NOT NULL,
    "purchaseRef" TEXT,
    "amoeMeta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LiveGiveawayEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LiveGiveaway_amoeRulesSlug_key" ON "LiveGiveaway"("amoeRulesSlug");

-- CreateIndex
CREATE INDEX "LiveGiveaway_liveRoomId_status_idx" ON "LiveGiveaway"("liveRoomId", "status");

-- CreateIndex
CREATE INDEX "LiveGiveaway_liveRoomId_kind_idx" ON "LiveGiveaway"("liveRoomId", "kind");

-- CreateIndex
CREATE INDEX "LiveGiveawayEntry_giveawayId_idx" ON "LiveGiveawayEntry"("giveawayId");

-- CreateIndex
CREATE UNIQUE INDEX "LiveGiveawayEntry_giveawayId_userId_key" ON "LiveGiveawayEntry"("giveawayId", "userId");

-- AddForeignKey
ALTER TABLE "LiveGiveaway" ADD CONSTRAINT "LiveGiveaway_liveRoomId_fkey" FOREIGN KEY ("liveRoomId") REFERENCES "LiveRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveGiveaway" ADD CONSTRAINT "LiveGiveaway_winnerUserId_fkey" FOREIGN KEY ("winnerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveGiveaway" ADD CONSTRAINT "LiveGiveaway_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveGiveawayEntry" ADD CONSTRAINT "LiveGiveawayEntry_giveawayId_fkey" FOREIGN KEY ("giveawayId") REFERENCES "LiveGiveaway"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveGiveawayEntry" ADD CONSTRAINT "LiveGiveawayEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
