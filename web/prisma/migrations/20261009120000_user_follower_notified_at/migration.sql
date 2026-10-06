-- One follower-wide notification per seller per hour (additive, nullable).
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "followerNotifiedAt" TIMESTAMP(3);
