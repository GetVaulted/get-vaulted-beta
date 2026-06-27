import * as Device from 'expo-device';
import { Dimensions, Platform } from 'react-native';
import type { LiveRoomBuyerSnapshot } from '../api/liveRoomBuyerRepository';
import type { LiveStream } from '../types';
import { isActiveVariantBuyerItem } from './liveItemVariant';
import { isVariantSpotAuctionLive, isVariantSpotFixedCheckoutLive } from './liveVariantSpotCommerce';

/** Plain fixed-price buy now in a sale room (not PYT/PYD variant checkout). */
export function isActiveBuyNowBuyerItem(
  roomSnap: LiveRoomBuyerSnapshot | null | undefined,
): boolean {
  if (!roomSnap?.activeItemId || roomSnap.status !== 'live') return false;
  if (isActiveVariantBuyerItem(roomSnap)) return false;
  return roomSnap.roomType === 'sale';
}

/** True when HUD primary action is auction bid (slide or Bid label). */
export function isLiveBidCommerceUi(args: {
  bottomRightIsSlide?: boolean;
  bottomRightLabel?: string;
}): boolean {
  if (args.bottomRightIsSlide) return true;
  return /\bbid\b/i.test(args.bottomRightLabel ?? '');
}

/**
 * Hard guard: live pinned commerce must use live bid API — never Initiate Trade.
 * Does not rely solely on `resolveBuyerRoomKind` (snapshot can lag on some devices).
 */
export function mustUseLiveBidFlow(
  stream: LiveStream,
  roomSnap: LiveRoomBuyerSnapshot | null | undefined,
  hud?: { bottomRightIsSlide?: boolean; bottomRightLabel?: string },
): boolean {
  if (isVariantSpotAuctionLive(roomSnap)) return true;
  if (isActiveVariantBuyerItem(roomSnap)) return false;
  if (isActiveBuyNowBuyerItem(roomSnap)) return false;

  if (hud?.bottomRightLabel && /select (spot|team)/i.test(hud.bottomRightLabel)) return false;
  if (hud?.bottomRightLabel && /\bbuy now\b/i.test(hud.bottomRightLabel)) return false;
  if (hud?.bottomRightLabel && /\bclaim (team|division|spot)\b/i.test(hud.bottomRightLabel)) return false;

  if (roomSnap?.activeItemId) return true;
  if (roomSnap?.roomType === 'auction' || roomSnap?.roomType === 'sale') return true;
  if (roomSnap?.lotBidPhase && roomSnap.lotBidPhase !== 'inactive') return true;

  if (stream.liveRoomFormat === 'auction' || stream.liveRoomFormat === 'shop') return true;
  if (stream.hybridFocus === 'auction') return true;

  // Pinned lot metadata before buyer snapshot hydrates (device/timing race).
  if (stream.currentItem?.trim() || stream.pinnedProductLabel?.trim()) return true;
  if (stream.liveActionPrimaryLabel?.toLowerCase().includes('bid')) return true;

  if (hud && isLiveBidCommerceUi(hud)) return true;

  return false;
}

export type LiveBidPressLog = {
  roomId: string;
  activeItemId: string | null;
  auctionLane: boolean;
  useLiveAuctionBidFlow: boolean;
  selectedAction: 'live_bid' | 'blocked_not_live_bid_ui';
  bottomRightLabel?: string;
  bottomRightIsSlide?: boolean;
  roomType?: string | null;
  lotBidPhase?: string | null;
};

export function logLiveBidButtonPress(data: LiveBidPressLog): void {
  const { width, height } = Dimensions.get('window');
  console.info('[live bid press]', {
    ...data,
    deviceModel: Device.modelName ?? Device.deviceName ?? 'unknown',
    screen: `${Math.round(width)}x${Math.round(height)}`,
    platform: Platform.OS,
    osVersion: Platform.Version,
  });
}
