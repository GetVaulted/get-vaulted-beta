/** Session-only collapse state for host team board panel (per live room). */

export function hostTeamBoardPanelSessionKey(roomId: string): string {
  return `gv-host-team-board-collapsed:${roomId}`;
}

export function readHostTeamBoardPanelCollapsed(roomId: string): boolean {
  if (typeof sessionStorage === "undefined") return false;
  try {
    return sessionStorage.getItem(hostTeamBoardPanelSessionKey(roomId)) === "1";
  } catch {
    return false;
  }
}

export function writeHostTeamBoardPanelCollapsed(roomId: string, collapsed: boolean): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(hostTeamBoardPanelSessionKey(roomId), collapsed ? "1" : "0");
  } catch {
    /* ignore quota / private mode */
  }
}
