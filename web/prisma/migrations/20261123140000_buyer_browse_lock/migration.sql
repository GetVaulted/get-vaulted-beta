-- Buyer browse lock: set by an admin to hide all live shows and marketplace inventory from an account
-- (login, wallet, chat and existing orders are unaffected). NULL = not locked.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "browseLockedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "browseLockReason" TEXT;
