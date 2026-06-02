import type { ObsWidgetKind } from "@/lib/obs-studio-copy";

export const SELLER_OBS_PATH = "/account/seller/obs";

export function sellerShowConsolePath(roomId: string, roomType: string): string {
  if (roomType === "break") {
    return `/seller/live/${encodeURIComponent(roomId)}/console`;
  }
  return `/seller/live?room=${encodeURIComponent(roomId)}`;
}

export function obsWidgetUrl(
  kind: ObsWidgetKind,
  roomId: string,
  token: string,
  origin?: string,
): string {
  const base = (origin ?? (typeof window !== "undefined" ? window.location.origin : "")).replace(/\/$/, "");
  const q = new URLSearchParams({
    roomId,
    token,
  });
  return `${base}/seller/obs/widgets/${encodeURIComponent(kind)}?${q.toString()}`;
}
