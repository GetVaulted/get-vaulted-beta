-- Safe rollback if publishRequestId was partially deployed without matching app expectations.
DROP INDEX IF EXISTS "Listing_publishRequestId_key";
ALTER TABLE "Listing" DROP COLUMN IF EXISTS "publishRequestId";
