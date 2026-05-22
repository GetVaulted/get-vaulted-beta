/** Client-side fan-out after listing catalog mutations (web tabs + same-origin listeners). */
export function notifyListingsUpdated(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("gv-listings-updated"));
}
