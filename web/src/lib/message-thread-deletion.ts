/** How long a deleted conversation stays in the Deleted area before it is removed for good. */
export const DELETED_RETENTION_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

export type ThreadVisibility = "active" | "deleted" | "purged";

type ParticipantDeletion = { deletedAt: Date | null; purgedAt: Date | null } | null | undefined;

/**
 * Where a conversation shows up for ONE person. Delete is per person: the other participant is
 * unaffected. A message newer than the delete (or purge) brings the conversation back to the
 * inbox by itself, so nothing has to be written when someone replies.
 */
export function threadVisibility(participant: ParticipantDeletion, lastMessageAt: Date | null): ThreadVisibility {
  if (!participant) return "active";
  const last = lastMessageAt?.getTime() ?? 0;
  if (participant.purgedAt && last <= participant.purgedAt.getTime()) return "purged";
  if (participant.deletedAt && last <= participant.deletedAt.getTime()) return "deleted";
  return "active";
}

/** When a deleted conversation will be removed for good. */
export function purgeAtFor(deletedAt: Date): Date {
  return new Date(deletedAt.getTime() + DELETED_RETENTION_DAYS * DAY_MS);
}

export function deletedCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - DELETED_RETENTION_DAYS * DAY_MS);
}
