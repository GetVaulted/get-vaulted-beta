export const LIVE_TIP_PRESET_AMOUNTS_USD = [5, 10, 20, 50] as const;
export const LIVE_TIP_MIN_USD = 1;
export const LIVE_TIP_MAX_USD = 500;

export async function startLiveTipCheckout(
  liveRoomId: string,
  body: { amountUsd: number; message?: string },
): Promise<{ url: string; liveTipId: string }> {
  const res = await fetch(`/api/live-rooms/${encodeURIComponent(liveRoomId)}/tips`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  const j = (await res.json().catch(() => ({}))) as { url?: string; liveTipId?: string; error?: string };
  if (!res.ok) {
    throw new Error(typeof j.error === "string" && j.error.trim() ? j.error.trim() : "Could not start tip checkout.");
  }
  if (!j.url) throw new Error("Could not start tip checkout.");
  return { url: j.url, liveTipId: j.liveTipId ?? "" };
}
