/**
 * Back → in-app mini keeps the same live feed joined (Whatnot / OS PiP model).
 * Tear down only when the buyer closes the float or opens another show.
 */
let keepAliveRoomId: string | null = null;

export function setLiveFeedKeepAlive(roomId: string | null): void {
  keepAliveRoomId = roomId?.trim() || null;
}

export function getLiveFeedKeepAliveRoomId(): string | null {
  return keepAliveRoomId;
}

export function isLiveFeedKeepAlive(roomId?: string | null): boolean {
  if (!keepAliveRoomId) return false;
  if (roomId == null || roomId === '') return true;
  return keepAliveRoomId === roomId;
}

/** Test-only reset. */
export function resetLiveFeedKeepAliveForTests(): void {
  keepAliveRoomId = null;
}
