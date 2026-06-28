import type { LiveGiveawayDTO } from "@/lib/live-giveaway";

export type CreateGiveawayPayload = {
  kind: "open" | "buyers";
  title: string;
  prizeDescription?: string;
  imageUrl?: string;
  rulesText?: string;
  openEntries?: boolean;
};

type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function parseError(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: string };
    if (typeof j.error === "string" && j.error.trim()) return j.error.trim();
  } catch {
    /* ignore */
  }
  return `Request failed (${res.status})`;
}

export async function createLiveGiveawayClient(
  roomId: string,
  payload: CreateGiveawayPayload,
): Promise<ApiResult<{ giveaway: LiveGiveawayDTO }>> {
  const res = await fetch(`/api/live-rooms/${encodeURIComponent(roomId)}/giveaways`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) return { ok: false, error: await parseError(res) };
  const j = (await res.json()) as { giveaway?: LiveGiveawayDTO };
  if (!j.giveaway?.id) return { ok: false, error: "Invalid response." };
  return { ok: true, data: { giveaway: j.giveaway } };
}

export async function patchLiveGiveawayClient(
  roomId: string,
  giveawayId: string,
  action: "open_entries" | "close_entries" | "cancel" | "draw",
): Promise<ApiResult<{ giveaway: LiveGiveawayDTO; spin?: unknown }>> {
  const res = await fetch(
    `/api/live-rooms/${encodeURIComponent(roomId)}/giveaways/${encodeURIComponent(giveawayId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    },
  );
  if (!res.ok) return { ok: false, error: await parseError(res) };
  const j = (await res.json()) as { giveaway?: LiveGiveawayDTO; spin?: unknown };
  if (!j.giveaway?.id) return { ok: false, error: "Invalid response." };
  return { ok: true, data: { giveaway: j.giveaway, spin: j.spin } };
}

export async function deleteLiveGiveawayClient(roomId: string, giveawayId: string): Promise<ApiResult<{ ok: true }>> {
  const res = await fetch(
    `/api/live-rooms/${encodeURIComponent(roomId)}/giveaways/${encodeURIComponent(giveawayId)}`,
    { method: "DELETE" },
  );
  if (!res.ok) return { ok: false, error: await parseError(res) };
  return { ok: true, data: { ok: true } };
}
