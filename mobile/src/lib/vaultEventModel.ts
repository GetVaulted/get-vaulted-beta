import type { LiveRoomApiRow } from '../api/liveRoomsRepository';

/** Seller-facing lifecycle label on event cards. */
export type VaultEventDisplayStatus =
  | 'draft'
  | 'scheduled'
  | 'preparing'
  | 'live'
  | 'ended'
  | 'processing_recap';

export type VaultEventSection = 'live_now' | 'upcoming' | 'drafts' | 'past';

export type VaultEventBucket = {
  section: VaultEventSection;
  displayStatus: VaultEventDisplayStatus;
  room: LiveRoomApiRow;
};

const PREPARING_WINDOW_MS = 2 * 60 * 60 * 1000;
const RECAP_WINDOW_MS = 48 * 60 * 60 * 1000;

export function vaultEventDisplayStatus(room: LiveRoomApiRow): VaultEventDisplayStatus {
  if (room.status === 'live') return 'live';
  if (room.status === 'ended') {
    if (room.endedAt) {
      const ended = Date.parse(room.endedAt);
      if (Number.isFinite(ended) && Date.now() - ended < RECAP_WINDOW_MS) {
        return 'processing_recap';
      }
    }
    return 'ended';
  }
  // Match web seller manager: scheduled time + title is enough; inventory can be added in command center.
  const incomplete = !room.scheduledStartAt || room.title.trim().length < 3;
  if (incomplete) return 'draft';
  if (room.scheduledStartAt) {
    const start = Date.parse(room.scheduledStartAt);
    if (Number.isFinite(start) && start - Date.now() <= PREPARING_WINDOW_MS && start > Date.now()) {
      return 'preparing';
    }
  }
  return 'scheduled';
}

export function vaultEventSection(room: LiveRoomApiRow): VaultEventSection {
  const status = vaultEventDisplayStatus(room);
  if (status === 'live') return 'live_now';
  if (status === 'ended' || status === 'processing_recap') return 'past';
  if (status === 'draft') return 'drafts';
  return 'upcoming';
}

export function statusLabel(status: VaultEventDisplayStatus): string {
  switch (status) {
    case 'draft':
      return 'Draft';
    case 'scheduled':
      return 'Scheduled';
    case 'preparing':
      return 'Preparing';
    case 'live':
      return 'Live';
    case 'processing_recap':
      return 'Processing recap';
    default:
      return 'Ended';
  }
}

export function primaryCta(status: VaultEventDisplayStatus): { label: string; action: 'console' | 'setup' | 'recap' } {
  switch (status) {
    case 'draft':
      return { label: 'Continue setup', action: 'setup' };
    case 'scheduled':
    case 'preparing':
      return { label: 'Enter command center', action: 'console' };
    case 'live':
      return { label: 'Open command center', action: 'console' };
    case 'processing_recap':
    case 'ended':
      return { label: 'View recap', action: 'recap' };
  }
}

export function formatEventWhen(room: LiveRoomApiRow, displayStatus: VaultEventDisplayStatus): string {
  if (displayStatus === 'live') {
    return room.viewerCount > 0 ? `${room.viewerCount} watching` : 'On air now';
  }
  if (!room.scheduledStartAt) return 'Schedule when ready';
  try {
    const d = new Date(room.scheduledStartAt);
    const diff = d.getTime() - Date.now();
    if (displayStatus === 'preparing' && diff > 0) {
      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      if (h > 0) return `Starts in ${h}h ${m}m`;
      return `Starts in ${m}m`;
    }
    return d.toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return 'Scheduled';
  }
}

export function bucketRooms(rooms: LiveRoomApiRow[]): Record<VaultEventSection, VaultEventBucket[]> {
  const out: Record<VaultEventSection, VaultEventBucket[]> = {
    live_now: [],
    upcoming: [],
    drafts: [],
    past: [],
  };
  for (const room of rooms) {
    const displayStatus = vaultEventDisplayStatus(room);
    const section = vaultEventSection(room);
    out[section].push({ section, displayStatus, room });
  }
  const byUpdated = (a: VaultEventBucket, b: VaultEventBucket) => {
    const ta = a.room.scheduledStartAt ? new Date(a.room.scheduledStartAt).getTime() : 0;
    const tb = b.room.scheduledStartAt ? new Date(b.room.scheduledStartAt).getTime() : 0;
    return tb - ta || a.room.title.localeCompare(b.room.title);
  };
  out.live_now.sort((a, b) => (b.room.viewerCount ?? 0) - (a.room.viewerCount ?? 0));
  out.upcoming.sort(byUpdated);
  out.drafts.sort(byUpdated);
  out.past.sort((a, b) => {
    const ta = a.room.endedAt ? new Date(a.room.endedAt).getTime() : 0;
    const tb = b.room.endedAt ? new Date(b.room.endedAt).getTime() : 0;
    return tb - ta;
  });
  return out;
}
