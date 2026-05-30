/** Session-only minimize state for host stage commerce overlays (per live room). */

export function hostCommercePanelSessionKey(roomId: string): string {
  return `gv-host-commerce-min:${roomId}`;
}

export function readHostCommercePanelMinimized(roomId: string): boolean {
  if (typeof sessionStorage === "undefined") return false;
  try {
    return sessionStorage.getItem(hostCommercePanelSessionKey(roomId)) === "1";
  } catch {
    return false;
  }
}

export function writeHostCommercePanelMinimized(roomId: string, minimized: boolean): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(hostCommercePanelSessionKey(roomId), minimized ? "1" : "0");
  } catch {
    /* ignore quota / private mode */
  }
}
