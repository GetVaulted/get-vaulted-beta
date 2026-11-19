import { prisma } from "@/lib/prisma";
import {
  contextIndices,
  evaluateOffAppMessage,
  OFF_APP_ORDER_WINDOW_AFTER_DAYS,
  OFF_APP_ORDER_WINDOW_BEFORE_DAYS,
  threadLevel,
  type OffAppLevel,
  type OffAppTag,
} from "@/lib/admin/off-app-rules";

export {
  OFF_APP_LEVEL_LABEL,
  OFF_APP_TAG_LABEL,
  type OffAppLevel,
  type OffAppTag,
} from "@/lib/admin/off-app-rules";

const DAY_MS = 86_400_000;
const MAX_MESSAGES = 10_000;
const MAX_THREADS = 80;

export type OffAppLine = {
  id: string;
  createdAt: Date;
  sender: string;
  body: string;
  hasImage: boolean;
  /** Present only on the messages the rules flagged. */
  level: OffAppLevel | null;
  tags: OffAppTag[];
  amounts: string[];
};

export type OffAppOrderLink = {
  id: string;
  createdAt: Date;
  itemPriceUsd: number;
  paymentStatus: string;
  status: string;
};

export type OffAppThread = {
  threadId: string;
  level: OffAppLevel;
  tags: OffAppTag[];
  users: [string, string];
  firstFlaggedAt: Date;
  lastFlaggedAt: Date;
  flaggedCount: number;
  amounts: string[];
  /** Messages around each flagged one, oldest first. Gaps are marked by `gapBefore`. */
  lines: Array<OffAppLine & { gapBefore: boolean }>;
  /** App orders between these two accounts close to the flagged messages. */
  orders: OffAppOrderLink[];
};

const LEVEL_RANK: Record<OffAppLevel, number> = { high: 2, medium: 1, low: 0 };

export async function loadOffAppWatch(opts?: {
  days?: number;
  includeLow?: boolean;
  now?: Date;
}): Promise<{ threads: OffAppThread[]; scanned: number; truncated: boolean }> {
  const now = opts?.now ?? new Date();
  const days = opts?.days ?? 30;
  const includeLow = opts?.includeLow ?? false;
  const since = new Date(now.getTime() - days * DAY_MS);

  const rows = await prisma.message.findMany({
    where: { createdAt: { gte: since }, kind: "user", NOT: { body: "" } },
    orderBy: { createdAt: "desc" },
    take: MAX_MESSAGES,
    select: {
      id: true,
      threadId: true,
      createdAt: true,
      body: true,
      sender: { select: { username: true, role: true } },
    },
  });

  // Flag messages. Your own admin accounts are skipped so support chats don't fill the list.
  const flaggedThreads = new Map<string, OffAppLevel[]>();
  for (const r of rows) {
    if (r.sender.role === "admin") continue;
    const v = evaluateOffAppMessage(r.body);
    if (!v) continue;
    if (v.level === "low" && !includeLow) continue;
    const list = flaggedThreads.get(r.threadId) ?? [];
    list.push(v.level);
    flaggedThreads.set(r.threadId, list);
  }

  const ranked = [...flaggedThreads.entries()]
    .map(([threadId, levels]) => ({ threadId, level: threadLevel(levels) }))
    .sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level])
    .slice(0, MAX_THREADS);
  if (ranked.length === 0) return { threads: [], scanned: rows.length, truncated: rows.length >= MAX_MESSAGES };

  const threadIds = ranked.map((t) => t.threadId);
  const [threadRows, messageRows] = await Promise.all([
    prisma.messageThread.findMany({
      where: { id: { in: threadIds } },
      select: {
        id: true,
        buyerId: true,
        sellerId: true,
        buyer: { select: { username: true } },
        seller: { select: { username: true } },
      },
    }),
    prisma.message.findMany({
      where: { threadId: { in: threadIds }, createdAt: { gte: since }, kind: "user" },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        threadId: true,
        createdAt: true,
        body: true,
        imageUrl: true,
        sender: { select: { username: true, role: true } },
      },
    }),
  ]);

  const threadById = new Map(threadRows.map((t) => [t.id, t]));
  const messagesByThread = new Map<string, typeof messageRows>();
  for (const m of messageRows) {
    const list = messagesByThread.get(m.threadId) ?? [];
    list.push(m);
    messagesByThread.set(m.threadId, list);
  }

  const out: OffAppThread[] = [];
  for (const { threadId } of ranked) {
    const thread = threadById.get(threadId);
    const msgs = messagesByThread.get(threadId) ?? [];
    if (!thread || msgs.length === 0) continue;

    const verdicts = msgs.map((m) => (m.sender.role === "admin" ? null : evaluateOffAppMessage(m.body)));
    const flaggedIdx: number[] = [];
    verdicts.forEach((v, i) => {
      if (v && (includeLow || v.level !== "low")) flaggedIdx.push(i);
    });
    if (flaggedIdx.length === 0) continue;

    const keep = contextIndices(msgs.length, flaggedIdx, 2);
    const lines: OffAppThread["lines"] = keep.map((i, pos) => {
      const m = msgs[i];
      const v = flaggedIdx.includes(i) ? verdicts[i] : null;
      return {
        id: m.id,
        createdAt: m.createdAt,
        sender: m.sender.username ?? "user",
        body: m.body,
        hasImage: Boolean(m.imageUrl),
        level: v?.level ?? null,
        tags: v?.tags ?? [],
        amounts: v?.amounts ?? [],
        gapBefore: pos > 0 && i - keep[pos - 1] > 1,
      };
    });

    const tags = new Set<OffAppTag>();
    const amounts = new Set<string>();
    for (const i of flaggedIdx) {
      for (const t of verdicts[i]!.tags) tags.add(t);
      for (const a of verdicts[i]!.amounts) amounts.add(a);
    }
    const first = msgs[flaggedIdx[0]].createdAt;
    const last = msgs[flaggedIdx[flaggedIdx.length - 1]].createdAt;

    out.push({
      threadId,
      level: threadLevel(flaggedIdx.map((i) => verdicts[i]!.level)),
      tags: [...tags],
      users: [thread.buyer.username ?? "user", thread.seller.username ?? "user"],
      firstFlaggedAt: first,
      lastFlaggedAt: last,
      flaggedCount: flaggedIdx.length,
      amounts: [...amounts],
      lines,
      orders: [],
    });
  }

  // Cross-check: did these two actually transact in the app around then?
  const pairByThread = new Map(threadRows.map((t) => [t.id, [t.buyerId, t.sellerId] as const]));
  for (let i = 0; i < out.length; i += 8) {
    await Promise.all(
      out.slice(i, i + 8).map(async (t) => {
        const pair = pairByThread.get(t.threadId);
        if (!pair) return;
        const [a, b] = pair;
        const orders = await prisma.order.findMany({
          where: {
            OR: [
              { buyerId: a, sellerId: b },
              { buyerId: b, sellerId: a },
            ],
            createdAt: {
              gte: new Date(t.firstFlaggedAt.getTime() - OFF_APP_ORDER_WINDOW_BEFORE_DAYS * DAY_MS),
              lte: new Date(t.lastFlaggedAt.getTime() + OFF_APP_ORDER_WINDOW_AFTER_DAYS * DAY_MS),
            },
          },
          orderBy: { createdAt: "asc" },
          take: 12,
          select: { id: true, createdAt: true, itemPriceUsd: true, paymentStatus: true, status: true },
        });
        t.orders = orders.map((o) => ({
          id: o.id,
          createdAt: o.createdAt,
          itemPriceUsd: o.itemPriceUsd,
          paymentStatus: String(o.paymentStatus),
          status: String(o.status),
        }));
      }),
    );
  }

  out.sort(
    (x, y) =>
      LEVEL_RANK[y.level] - LEVEL_RANK[x.level] || y.lastFlaggedAt.getTime() - x.lastFlaggedAt.getTime(),
  );
  return { threads: out, scanned: rows.length, truncated: rows.length >= MAX_MESSAGES };
}
