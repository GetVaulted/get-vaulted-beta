-- Additive-only: new nullable timestamp columns on "LiveRoom" for the T-30 / T-5 / go-live host
-- reminder pushes and for tracking a no-show auto-cancel. No existing columns are touched.

ALTER TABLE "LiveRoom"
  ADD COLUMN "hostT30NotifiedAt" TIMESTAMP(3),
  ADD COLUMN "hostT5NotifiedAt" TIMESTAMP(3),
  ADD COLUMN "hostGoLiveNotifiedAt" TIMESTAMP(3),
  ADD COLUMN "autoCancelledAt" TIMESTAMP(3);
