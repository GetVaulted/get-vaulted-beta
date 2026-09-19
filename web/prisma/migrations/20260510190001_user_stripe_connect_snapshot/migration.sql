-- Stripe Connect dashboard snapshots (web + webhooks + mobile HQ)

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "stripeChargesEnabled" BOOLEAN;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "stripePayoutsEnabled" BOOLEAN;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "stripeRequirementsDue" JSONB;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "stripeVerificationStatus" TEXT;
