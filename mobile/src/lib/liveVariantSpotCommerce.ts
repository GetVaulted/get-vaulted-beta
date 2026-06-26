import type { LiveRoomBuyerSnapshot } from '../api/liveRoomBuyerRepository';
import { hostPinnedBuyerVariant, isActiveVariantBuyerItem, isRandomVariantAssignment } from './liveItemVariant';

export type ActiveSpotCommerceMode = 'fixed' | 'auction';

export function isVariantSpotAuctionLive(
  snap: LiveRoomBuyerSnapshot | null | undefined,
): boolean {
  if (!snap?.activeItemId || !snap.biddingOpen) return false;
  if (!isActiveVariantBuyerItem(snap)) return false;
  return Boolean(snap.activeSpotCommerceMode === 'auction' && snap.auctionVariantId?.trim());
}

export function isVariantSpotFixedCheckoutLive(
  snap: LiveRoomBuyerSnapshot | null | undefined,
): boolean {
  if (!snap || !isActiveVariantBuyerItem(snap)) return false;
  if (isVariantSpotAuctionLive(snap)) return false;
  if (isRandomVariantAssignment(snap.activeItemVariantAssignmentMode)) return false;
  return Boolean(hostPinnedBuyerVariant(snap.activeItemVariants, snap.activeItemVariantAssignmentMode));
}

export function pinnedVariantAuctionPrimaryLabel(
  format: LiveRoomBuyerSnapshot['activeItemSalesFormat'],
  nextBidUsd: number,
): string {
  const money = `$${nextBidUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (format === 'team_break') return `Bid ${money}`;
  return `Place bid ${money}`;
}

export function hostHasPinnedVariantSpot(
  snap: Pick<LiveRoomBuyerSnapshot, 'activeItemVariants' | 'activeItemVariantAssignmentMode'> | null | undefined,
): boolean {
  return Boolean(hostPinnedBuyerVariant(snap?.activeItemVariants, snap?.activeItemVariantAssignmentMode));
}
