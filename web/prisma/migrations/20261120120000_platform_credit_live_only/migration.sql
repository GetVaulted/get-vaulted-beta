-- Live-only Get Vaulted Credit: spendable on live-show orders, never on marketplace checkouts.
-- Additive and backward compatible: existing rows default to false (spend anywhere, as before).
ALTER TABLE "PlatformCredit" ADD COLUMN IF NOT EXISTS "liveOnly" BOOLEAN NOT NULL DEFAULT false;
