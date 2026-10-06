-- CreateTable
CREATE TABLE "UserIpLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserIpLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserIpLog_userId_createdAt_idx" ON "UserIpLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "UserIpLog_ipAddress_idx" ON "UserIpLog"("ipAddress");

-- AddForeignKey
ALTER TABLE "UserIpLog" ADD CONSTRAINT "UserIpLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
