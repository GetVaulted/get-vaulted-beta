-- Store Expo push tokens keyed by canonical Prisma User.id (mobile registers via /api/account/push-token).

CREATE TABLE "PushDeviceToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expoPushToken" TEXT NOT NULL,
    "platform" TEXT,
    "deviceName" TEXT,
    "supabaseAuthUserId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PushDeviceToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PushDeviceToken_userId_expoPushToken_key" ON "PushDeviceToken"("userId", "expoPushToken");
CREATE INDEX "PushDeviceToken_userId_idx" ON "PushDeviceToken"("userId");
CREATE INDEX "PushDeviceToken_supabaseAuthUserId_idx" ON "PushDeviceToken"("supabaseAuthUserId");

ALTER TABLE "PushDeviceToken" ADD CONSTRAINT "PushDeviceToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
