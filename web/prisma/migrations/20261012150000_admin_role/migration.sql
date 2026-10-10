-- Admin sub-roles. NULL on an admin user means "owner" (unchanged full access). Additive only.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "adminRole" TEXT;
