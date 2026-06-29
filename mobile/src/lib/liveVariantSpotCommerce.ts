import type { LiveItemVariantSnapshot, LiveRoomBuyerSnapshot } from '../api/liveRoomBuyerRepository';
import {
  availableVariantCount,
  hostPinnedBuyerVariant,
  isActiveVariantBuyerItem,
  variantIsAvailable,
} from './liveItemVariant';

export type ActiveSpotCommerceMode = 'fixed' | 'auction';

export function isVariantSpotAuctionLive(
  snap: LiveRoomBuyerSnapshot | null | undefined,
): boolean {
  if (!snap?.activeItemId || !snap.biddingOpen) return false;
  if (!isActiveVariantBuyerItem(snap)) return false;
  return Boolean(snap.activeSpotCommerceMode === 'auction' && snap.auctionVariantId?.trim());
}

/** Variants buyers can claim via shop while a spot auction may be live on another team. */
export function shopAvailableVariants(
  snap: LiveRoomBuyerSnapshot | null | undefined,
): LiveItemVariantSnapshot[] {
  const variants = snap?.activeItemVariants ?? [];
  if (!variants.length) return [];
  if (isVariantSpotAuctionLive(snap) && snap!.auctionVariantId?.trim()) {
    const auctionId = snap!.auctionVariantId.trim();
    return variants.filter((v) => v.id !== auctionId && variantIsAvailable(v));
  }
  return variants.filter(variantIsAvailable);
}

export function shopVariantCountDuringSpotAuction(
  snap: LiveRoomBuyerSnapshot | null | undefined,
): number {
  return shopAvailableVariants(snap).length;
}

export function isVariantSpotFixedCheckoutLive(
  snap: LiveRoomBuyerSnapshot | null | undefined,
): boolean {
  if (!snap || !isActiveVariantBuyerItem(snap)) return false;
  return shopAvailableVariants(snap).length > 0;
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
