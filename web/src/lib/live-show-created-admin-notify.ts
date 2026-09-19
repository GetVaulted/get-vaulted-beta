import { scheduleNotifyAdmins } from "@/lib/admin/notify-admins";

function formatShowWhen(scheduledStartAt: Date | null | undefined): string {
  if (!scheduledStartAt) return "starts ASAP / now";
  try {
    return scheduledStartAt.toLocaleString("en-US", {
      timeZone: "America/Chicago",
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return scheduledStartAt.toISOString();
  }
}

/** Fire-and-forget ops alert when a seller creates a live show (including recurring slots). */
export function scheduleNotifyAdminsLiveShowCreated(input: {
  roomId: string;
  title: string;
  roomType: string;
  sellerUsername: string | null | undefined;
  scheduledStartAt: Date | null | undefined;
}): void {
  const handle = input.sellerUsername?.trim() || "seller";
  const when = formatShowWhen(input.scheduledStartAt ?? null);
  scheduleNotifyAdmins({
    type: "admin_live_show_created",
    title: "New live show scheduled",
    body: `@${handle} created "${input.title.slice(0, 120)}" (${input.roomType}) · ${when}`,
    href: "/admin/live-shows",
    dedupeKey: `live-show-created:${input.roomId}`,
  });
}
