-- Per-live-show completed sales GMV for volume-based platform fee tiers.
ALTER TABLE "LiveRoom" ADD COLUMN "completedSalesGmvUsd" DOUBLE PRECISION NOT NULL DEFAULT 0;
