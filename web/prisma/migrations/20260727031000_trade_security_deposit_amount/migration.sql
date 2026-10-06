-- Lock % based security deposit amount on the offer (both parties pay the same).
ALTER TABLE "TradeOffer" ADD COLUMN IF NOT EXISTS "securityDepositCents" INTEGER;
