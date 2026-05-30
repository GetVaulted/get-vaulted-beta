import type { LiveRoomBuyerSnapshot } from '../api/liveRoomBuyerRepository';
import { availableVariantCount } from './liveItemVariant';

/** Structured buyer room snapshot log for cross-client state debugging. */
export function logBuyerRoomStateSnapshot(
  source: string,
  snap: LiveRoomBuyerSnapshot,
  extra?: Record<string, unknown>,
): void {
  console.info('[room state] buyer snapshot', {
    source,
    roomId: snap.roomId,
    roomStatus: snap.status,
    roomType: snap.roomType,
    activeItemId: snap.activeItemId,
    activeItemTitle: snap.activeItemTitle ?? null,
    activeItemSalesFormat: snap.activeItemSalesFormat ?? null,
    lotBidPhase: snap.lotBidPhase,
    breakPhase: snap.breakPhase ?? null,
    breakStatus: {
      lockPurchases: snap.breakLockPurchases ?? false,
      paused: snap.breakPaused ?? false,
      full: snap.breakFull ?? false,
    },
    divisionClaimPhase:
      snap.activeItemSalesFormat === 'team_break' || snap.activeItemSalesFormat === 'variant_selection'
        ? 'variant_spot_sale'
        : snap.breakPhase === 'in_progress' || snap.breakPhase === 'randomizing'
          ? 'team_break_controls'
          : null,
    purchasesLocked: snap.breakLockPurchases ?? false,
    availableDivisionsOrSpots: availableVariantCount(snap.activeItemVariants),
    currentBidUsd: snap.currentBidUsd,
    minNextBidUsd: snap.minNextBidUsd,
    snapshotUpdatedAtMs: snap.fetchedAtMs,
    serverNowMs: snap.serverNowMs ?? null,
    ...extra,
  });
}
