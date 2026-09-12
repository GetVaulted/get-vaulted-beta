import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/** Matches the 14-day trash window described to users ("held for 14 days then permanently deleted"). */
const TRASH_RETENTION_DAYS = 14;
/** Defensive cap per run — mirrors the batch-limit pattern used by paypal-payout-reconcile. */
const BATCH_LIMIT = 500;

/**
 * Cron: permanently purge conversations a user deleted more than 14 days ago.
 *
 * "Delete" is per-participant (delete-for-me) — this only ever removes the *deleting user's own*
 * MessageThreadParticipant row once its 14-day window has passed. It never touches the other
 * participant's copy of the conversation. Once a thread has no remaining participant rows at all
 * (every side has either purged it or never had one), the MessageThread itself is hard-deleted,
 * which cascades to its Message rows.
 *
 * Protect with CRON_SECRET like other crons (see paypal-payout-reconcile).
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")?.trim();
  if (secret && auth !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);

  const expired = await prisma.messageThreadParticipant.findMany({
    where: { deletedAt: { not: null, lte: cutoff } },
    select: { id: true, threadId: true },
    take: BATCH_LIMIT,
  });

  if (expired.length === 0) {
    return NextResponse.json({ participantsPurged: 0, threadsDeleted: 0 });
  }

  const threadIds = [...new Set(expired.map((p) => p.threadId))];

  await prisma.messageThreadParticipant.deleteMany({
    where: { id: { in: expired.map((p) => p.id) } },
  });

  // Only hard-delete threads that now have zero remaining participants — if the other side hasn't
  // deleted (or purged) their copy yet, the thread and its messages stay intact for them.
  const remaining = await prisma.messageThreadParticipant.groupBy({
    by: ["threadId"],
    where: { threadId: { in: threadIds } },
    _count: { _all: true },
  });
  const stillHasParticipants = new Set(remaining.map((r) => r.threadId));
  const orphanedThreadIds = threadIds.filter((id) => !stillHasParticipants.has(id));

  let threadsDeleted = 0;
  if (orphanedThreadIds.length > 0) {
    const result = await prisma.messageThread.deleteMany({
      where: { id: { in: orphanedThreadIds } },
    });
    threadsDeleted = result.count;
  }

  return NextResponse.json({
    participantsPurged: expired.length,
    threadsScanned: threadIds.length,
    threadsDeleted,
  });
}
