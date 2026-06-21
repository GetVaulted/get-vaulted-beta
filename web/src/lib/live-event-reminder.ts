const STORAGE_PREFIX = "gv-live-reminder:";

export type LiveEventReminderInput = {
  liveRoomId: string;
  roomTitle: string;
  hostSellerId: string;
  hostName: string;
};

export function isLiveEventReminderSet(liveRoomId: string): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(`${STORAGE_PREFIX}${liveRoomId}`) === "1";
}

/** Follow the host and mark this room for go-live alerts (push when seller starts stream). */
export async function setLiveEventReminder(
  input: LiveEventReminderInput,
): Promise<{ ok: boolean; alreadySet?: boolean; error?: string }> {
  if (typeof window === "undefined") {
    return { ok: false, error: "Reminders are only available in the browser." };
  }

  const key = `${STORAGE_PREFIX}${input.liveRoomId}`;
  if (window.localStorage.getItem(key) === "1") {
    return { ok: true, alreadySet: true };
  }

  const followRes = await fetch(`/api/sellers/${encodeURIComponent(input.hostSellerId)}/follow`, {
    method: "POST",
    credentials: "include",
  });
  if (!followRes.ok && followRes.status !== 409) {
    const body = (await followRes.json().catch(() => ({}))) as { error?: string };
    return {
      ok: false,
      error: typeof body.error === "string" ? body.error : "Could not follow this seller.",
    };
  }

  window.localStorage.setItem(key, "1");
  return { ok: true };
}

export function liveEventReminderSuccessMessage(input: LiveEventReminderInput, alreadySet: boolean): string {
  if (alreadySet) {
    return `You're already set to be notified when ${input.roomTitle} goes live.`;
  }
  return `Following ${input.hostName}. We'll notify you when ${input.roomTitle} goes live.`;
}
