export const LIVE_HOST_SELF_COMMERCE_ERROR =
  "You cannot bid or buy items in your own live room.";

export const LIVE_MODERATOR_COMMERCE_ERROR =
  "Moderators cannot bid or buy items in shows they are moderating.";

export const LIVE_BROADCAST_OFFLINE_COMMERCE_ERROR =
  "The host stream is offline. Purchases and bids are paused until they reconnect.";

export const LIVE_STREAM_PAUSED_COMMERCE_ERROR =
  "The host paused the stream. Bidding is paused — Buy Now and shop are still available.";

export const PHONE_VERIFICATION_REQUIRED_MESSAGE =
  "Verify your phone number to bid, buy, enter giveaways or go live. Open the Get Vaulted app to do it — it takes under a minute.";

export type LiveBuyerCommerceBlockCode =
  | "PHONE_VERIFICATION_REQUIRED"
  | "PURCHASES_LOCKED"
  | "ROOM_NOT_FOUND"
  | "LIVE_HOST_SELF_COMMERCE"
  | "LIVE_MODERATOR_COMMERCE"
  | "LIVE_BROADCAST_OFFLINE"
  | "LIVE_STREAM_PAUSED";

export type LiveBuyerCommerceBlock = {
  status: number;
  error: string;
  code: LiveBuyerCommerceBlockCode;
};
