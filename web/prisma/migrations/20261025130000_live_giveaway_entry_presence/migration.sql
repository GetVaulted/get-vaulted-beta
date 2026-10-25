-- Giveaway presence: last time a viewer was confirmed in the room. A "left" notice arriving within a few
-- seconds of this is treated as an out-of-order event and ignored. Additive and nullable (older rows = NULL).
ALTER TABLE "LiveGiveawayEntry" ADD COLUMN IF NOT EXISTS "presenceAt" TIMESTAMP(3);
