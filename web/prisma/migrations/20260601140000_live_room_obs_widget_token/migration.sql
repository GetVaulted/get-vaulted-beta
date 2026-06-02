-- OBS browser-source widget auth (hashed token per room)
ALTER TABLE "LiveRoom" ADD COLUMN "obsWidgetTokenHash" TEXT;
ALTER TABLE "LiveRoom" ADD COLUMN "obsWidgetTokenRotatedAt" TIMESTAMP(3);
