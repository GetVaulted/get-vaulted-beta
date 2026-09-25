import { prisma } from "@/lib/prisma";

export const APP_PRESENCE_ONLINE_WINDOW_MS = 2 * 60 * 1000;
export const APP_PRESENCE_WRITE_THROTTLE_MS = 20_000;

export type AppPresencePlatformId = "ios" | "android" | "web";

export type OnlinePresenceSummary = {
  onlineNow: number;
  onlineByPlatform: { ios: number; android: number; web: number };
};

export function parseAppPresencePlatform(raw: unknown): AppPresencePlatformId | null {
  if (raw === "ios" || raw === "android" || raw === "web") return raw;
  return null;
}

export function shouldSkipPresenceWrite(
  lastSeenAt: Date | null | undefined,
  now: Date,
  throttleMs = APP_PRESENCE_WRITE_THROTTLE_MS,
): boolean {
  if (!lastSeenAt) return false;
  return now.getTime() - lastSeenAt.getTime() < throttleMs;
}

export function summarizeOnlinePresence(
  rows: Array<{ userId: string; platform: AppPresencePlatformId }>,
): OnlinePresenceSummary {
  const users = new Set<string>();
  const onlineByPlatform = { ios: 0, android: 0, web: 0 };
  for (const row of rows) {
    users.add(row.userId);
    onlineByPlatform[row.platform] += 1;
  }
  return { onlineNow: users.size, onlineByPlatform };
}

export async function recordAppPresence(args: {
  userId: string;
  platform: AppPresencePlatformId;
  now?: Date;
}): Promise<{ skipped: boolean }> {
  const now = args.now ?? new Date();
  const existing = await prisma.userAppPresence.findUnique({
    where: {
      userId_platform: { userId: args.userId, platform: args.platform },
    },
    select: { lastSeenAt: true },
  });

  if (shouldSkipPresenceWrite(existing?.lastSeenAt, now)) {
    return { skipped: true };
  }

  await prisma.userAppPresence.upsert({
    where: {
      userId_platform: { userId: args.userId, platform: args.platform },
    },
    create: {
      userId: args.userId,
      platform: args.platform,
      lastSeenAt: now,
    },
    update: {
      lastSeenAt: now,
    },
  });

  return { skipped: false };
}

export async function loadOnlinePresenceSummary(now = new Date()): Promise<OnlinePresenceSummary> {
  const since = new Date(now.getTime() - APP_PRESENCE_ONLINE_WINDOW_MS);
  const rows = await prisma.userAppPresence.findMany({
    where: { lastSeenAt: { gte: since } },
    select: { userId: true, platform: true },
  });
  return summarizeOnlinePresence(
    rows.map((r) => ({ userId: r.userId, platform: r.platform as AppPresencePlatformId })),
  );
}
