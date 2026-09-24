-- CreateEnum
CREATE TYPE "ProfilePullMediaType" AS ENUM ('PHOTO', 'VIDEO');

-- CreateTable
CREATE TABLE "ProfilePullMedia" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "type" "ProfilePullMediaType" NOT NULL,
    "url" TEXT NOT NULL,
    "durationMs" INTEGER,
    "byteSize" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProfilePullMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PullLike" (
    "id" TEXT NOT NULL,
    "pullMediaId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PullLike_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PullComment" (
    "id" TEXT NOT NULL,
    "pullMediaId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PullComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProfilePullMedia_sellerId_type_sortOrder_idx" ON "ProfilePullMedia"("sellerId", "type", "sortOrder");

-- CreateIndex
CREATE INDEX "PullLike_pullMediaId_idx" ON "PullLike"("pullMediaId");

-- CreateIndex
CREATE UNIQUE INDEX "PullLike_pullMediaId_userId_key" ON "PullLike"("pullMediaId", "userId");

-- CreateIndex
CREATE INDEX "PullComment_pullMediaId_createdAt_idx" ON "PullComment"("pullMediaId", "createdAt");

-- AddForeignKey
ALTER TABLE "ProfilePullMedia" ADD CONSTRAINT "ProfilePullMedia_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PullLike" ADD CONSTRAINT "PullLike_pullMediaId_fkey" FOREIGN KEY ("pullMediaId") REFERENCES "ProfilePullMedia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PullLike" ADD CONSTRAINT "PullLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PullComment" ADD CONSTRAINT "PullComment_pullMediaId_fkey" FOREIGN KEY ("pullMediaId") REFERENCES "ProfilePullMedia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PullComment" ADD CONSTRAINT "PullComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PullComment" ADD CONSTRAINT "PullComment_deletedByUserId_fkey" FOREIGN KEY ("deletedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
