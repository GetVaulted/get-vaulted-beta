-- AlterTable
ALTER TABLE "UserIpLog" ADD COLUMN     "city" TEXT,
ADD COLUMN     "region" TEXT,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "countryCode" TEXT,
ADD COLUMN     "lat" DOUBLE PRECISION,
ADD COLUMN     "lon" DOUBLE PRECISION;
