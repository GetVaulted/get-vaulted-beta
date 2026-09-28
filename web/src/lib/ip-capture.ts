import { prisma } from "@/lib/prisma";

/**
 * How long we'll go without re-logging the *same* IP for the same user.
 * Keeps UserIpLog small (one row per distinct IP seen per window) instead of
 * growing one row per heartbeat, while still catching IP changes quickly.
 */
export const IP_LOG_DEDUPE_WINDOW_MS = 6 * 60 * 60 * 1000; // 6 hours

/**
 * Netlify sets this at the edge to the true connecting client IP — prefer it
 * over `x-forwarded-for`, which can be rewritten by intermediate proxies.
 * Falls back to the standard proxy headers for local/dev requests.
 */
export function extractClientIp(req: Request): string | null {
  const nfConnectionIp = req.headers.get("x-nf-client-connection-ip");
  if (nfConnectionIp?.trim()) return nfConnectionIp.trim();

  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }

  const realIp = req.headers.get("x-real-ip");
  if (realIp?.trim()) return realIp.trim();

  return null;
}

/**
 * Fire-and-forget IP capture for abuse/security investigation ("who was on
 * this account, from where, and when"). Never throws — a failure here must
 * never break the caller's real request.
 *
 * Dedup: only writes a new row when this user+IP pair hasn't been logged
 * within IP_LOG_DEDUPE_WINDOW_MS, so a heartbeat that fires every ~20s
 * doesn't create a row every 20s.
 */
export async function recordUserIp(args: {
  req: Request;
  userId: string;
  source: string;
}): Promise<void> {
  try {
    const ipAddress = extractClientIp(args.req);
    if (!ipAddress) return;

    const recent = await prisma.userIpLog.findFirst({
      where: { userId: args.userId, ipAddress },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });

    if (recent && Date.now() - recent.createdAt.getTime() < IP_LOG_DEDUPE_WINDOW_MS) {
      return;
    }

    const userAgent = args.req.headers.get("user-agent");

    await prisma.userIpLog.create({
      data: {
        userId: args.userId,
        ipAddress,
        source: args.source,
        userAgent: userAgent?.slice(0, 500) ?? null,
      },
    });
  } catch (err) {
    console.error("[ip-capture] failed to record user IP", err);
  }
}
