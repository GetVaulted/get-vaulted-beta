-- Buyer purchase lock (fraud protection): set after repeated failed payments or by an admin.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "purchasesLockedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "purchasesLockReason" TEXT;
