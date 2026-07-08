-- Track when a member confirmed their public username (email signup, OAuth profile setup, or username change).
ALTER TABLE "User" ADD COLUMN "usernameChosenAt" TIMESTAMP(3);

-- Existing accounts already have a username — treat it as chosen at account creation so they skip OAuth onboarding.
UPDATE "User" SET "usernameChosenAt" = "createdAt" WHERE "usernameChosenAt" IS NULL;
