import { LIVE_DISCOVERY_WINDOW_EVENT } from "@/lib/live-discovery-realtime";

/** Client-side fan-out after live room create/schedule (same tab + other web sections). */
export function notifyLiveDiscoveryChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(LIVE_DISCOVERY_WINDOW_EVENT));
}
