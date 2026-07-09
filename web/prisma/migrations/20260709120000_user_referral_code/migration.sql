-- Secret per-user referral codes for share links (`/join?ref=...`), separate from public usernames.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "referralCode" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "User_referralCode_key" ON "User"("referralCode");
