-- Allow moderators to undo mistaken kick / seller-stream-ban actions.
ALTER TYPE "LiveRoomModerationActionType" ADD VALUE IF NOT EXISTS 'unkick';
ALTER TYPE "LiveRoomModerationActionType" ADD VALUE IF NOT EXISTS 'seller_stream_unban';
