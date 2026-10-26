-- One verified phone number per account (spam / duplicate-account protection).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "phoneE164" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "phoneVerifiedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "phoneVerificationRequired" BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS "User_phoneE164_key" ON "User"("phoneE164");
