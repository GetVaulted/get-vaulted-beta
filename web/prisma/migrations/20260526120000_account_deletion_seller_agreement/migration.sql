-- Account deletion + seller agreement acceptance timestamps

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "sellerAgreementAcceptedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "accountDeletedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "User_accountDeletedAt_idx" ON "User"("accountDeletedAt");
