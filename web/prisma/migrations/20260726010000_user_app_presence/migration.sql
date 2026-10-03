-- CreateEnum
CREATE TYPE "AppPresencePlatform" AS ENUM ('ios', 'android', 'web');

-- CreateTable
CREATE TABLE "UserAppPresence" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" "AppPresencePlatform" NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserAppPresence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserAppPresence_lastSeenAt_idx" ON "UserAppPresence"("lastSeenAt");

-- CreateIndex
CREATE INDEX "UserAppPresence_platform_lastSeenAt_idx" ON "UserAppPresence"("platform", "lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserAppPresence_userId_platform_key" ON "UserAppPresence"("userId", "platform");

-- AddForeignKey
ALTER TABLE "UserAppPresence" ADD CONSTRAINT "UserAppPresence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
