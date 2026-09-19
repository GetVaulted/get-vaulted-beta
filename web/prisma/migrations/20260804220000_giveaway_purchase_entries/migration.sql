-- Add purchase entry type for giveaway spend bonuses
ALTER TYPE "GiveawayEntryType" ADD VALUE IF NOT EXISTS 'purchase';
