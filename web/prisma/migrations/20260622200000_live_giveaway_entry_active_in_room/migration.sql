-- Open-entry giveaways only count viewers who are present in the room (anti room-hopping).
ALTER TABLE "LiveGiveawayEntry"
ADD COLUMN "activeInRoom" BOOLEAN NOT NULL DEFAULT true;
