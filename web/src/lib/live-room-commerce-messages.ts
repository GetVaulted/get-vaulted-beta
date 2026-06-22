export const LIVE_HOST_SELF_COMMERCE_ERROR =
  "You cannot bid or buy items in your own live room.";

export const LIVE_MODERATOR_COMMERCE_ERROR =
  "Moderators cannot bid or buy items in shows they are moderating.";

export type LiveBuyerCommerceBlockCode =
  | "ROOM_NOT_FOUND"
  | "LIVE_HOST_SELF_COMMERCE"
  | "LIVE_MODERATOR_COMMERCE";

export type LiveBuyerCommerceBlock = {
  status: number;
  error: string;
  code: LiveBuyerCommerceBlockCode;
};
