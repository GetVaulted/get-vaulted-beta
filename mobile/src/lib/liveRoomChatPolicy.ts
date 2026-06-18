/** Published shows in the live section accept chat before and during the stream. */
export function liveRoomChatOpen(status: string | null | undefined): boolean {
  const normalized = status?.trim().toLowerCase();
  return normalized === 'live' || normalized === 'scheduled';
}
