/**
 * Tracks which room the process-wide IVS Stage singleton is currently joined to.
 * Used so Back→mini can remount a Stage view without leave+rejoin.
 */
let joinedRoomId: string | null = null;

export function markBuyerStageJoined(roomId: string): void {
  joinedRoomId = roomId?.trim() || null;
}

export function markBuyerStageLeft(roomId?: string | null): void {
  if (roomId && joinedRoomId && roomId !== joinedRoomId) return;
  joinedRoomId = null;
}

export function getBuyerStageJoinedRoomId(): string | null {
  return joinedRoomId;
}

/** Test-only reset. */
export function resetBuyerStageJoinedRoomForTests(): void {
  joinedRoomId = null;
}
