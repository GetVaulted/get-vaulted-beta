import {
  CopyObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { prisma } from "@/lib/prisma";
import { makeS3Client, recordingsBucket } from "@/lib/trust/live-recording-s3";
import { replayRetentionCutoff } from "@/lib/trust/live-replay-service";
import {
  buildClipPlaylist,
  channelS3Base,
  parseMediaPlaylist,
  recordingDayPrefixes,
  selectClipSegments,
  signWinClipToken,
  verifyWinClipToken,
  type ClipSelection,
  type WinClipKind,
} from "@/lib/trust/win-clip-playlist";

/** Highest first; 720p is plenty for a phone receipt and keeps the clip small. */
const RENDITIONS = ["720p30", "480p30", "360p30"];
const TOKEN_TTL_MS = 6 * 60 * 60 * 1000;
const SEGMENT_URL_TTL_SECONDS = 3 * 60 * 60;

function tokenSecret(): string {
  const s = process.env.NEXTAUTH_SECRET?.trim();
  if (!s) throw new Error("NEXTAUTH_SECRET is not configured.");
  return s;
}

export type WinMoment = {
  kind: WinClipKind;
  id: string;
  buyerId: string;
  liveRoomId: string;
  momentMs: number;
  title: string;
  subtitle: string | null;
  showTitle: string | null;
};

async function channelArnsForRoom(liveRoomId: string): Promise<string[]> {
  const [room, replays] = await Promise.all([
    prisma.liveRoom.findUnique({ where: { id: liveRoomId }, select: { ivsChannelArn: true } }),
    prisma.liveStreamReplay.findMany({
      where: { liveRoomId },
      select: { streamSessionId: true },
      take: 20,
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const set = new Set<string>();
  if (room?.ivsChannelArn) set.add(room.ivsChannelArn);
  for (const r of replays) if (r.streamSessionId?.startsWith("arn:aws:ivs:")) set.add(r.streamSessionId);
  return [...set];
}

/** Load one win the signed-in buyer owns (spot claim or live order). Null when not theirs / not live. */
export async function loadWinMoment(kind: WinClipKind, id: string, buyerId?: string): Promise<WinMoment | null> {
  if (kind === "spot") {
    const p = await prisma.liveItemVariantPurchase.findFirst({
      where: { id, paymentStatus: "paid", ...(buyerId ? { buyerId } : {}) },
      select: {
        id: true,
        buyerId: true,
        liveRoomId: true,
        createdAt: true,
        paidAt: true,
        revealedLabel: true,
        variant: { select: { label: true } },
        liveRoom: { select: { title: true } },
      },
    });
    if (!p) return null;
    // The claim happens at purchase time; paidAt can lag when the buyer finishes checkout later.
    const when = p.createdAt;
    return {
      kind,
      id: p.id,
      buyerId: p.buyerId,
      liveRoomId: p.liveRoomId,
      momentMs: when.getTime(),
      title: p.revealedLabel || p.variant.label,
      subtitle: "Spot claimed",
      showTitle: p.liveRoom.title ?? null,
    };
  }
  const item = await prisma.liveShippingSessionItem.findFirst({
    where: { orderId: id, ...(buyerId ? { session: { buyerId } } : {}) },
    select: {
      order: { select: { id: true, createdAt: true, listing: { select: { title: true } } } },
      session: { select: { buyerId: true, liveShowId: true, liveShow: { select: { title: true } } } },
    },
  });
  if (!item) return null;
  return {
    kind,
    id: item.order.id,
    buyerId: item.session.buyerId,
    liveRoomId: item.session.liveShowId,
    momentMs: item.order.createdAt.getTime(),
    title: item.order.listing.title,
    subtitle: "Item won",
    showTitle: item.session.liveShow.title ?? null,
  };
}

export type WinListEntry = {
  kind: WinClipKind;
  id: string;
  title: string;
  subtitle: string | null;
  showTitle: string | null;
  at: string;
  liveRoomId: string;
};

/** Buyer's live wins with a video receipt: permanently saved clips plus recent wins still inside the recording window. */
export async function listBuyerWins(buyerId: string, take = 60): Promise<WinListEntry[]> {
  const since = replayRetentionCutoff();
  const [saved, spots, orders] = await Promise.all([
    prisma.winClipSave.findMany({
      where: { buyerId, status: "saved" },
      orderBy: { momentAt: "desc" },
      take,
    }),
    prisma.liveItemVariantPurchase.findMany({
      where: { buyerId, paymentStatus: "paid", createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take,
      select: {
        id: true,
        liveRoomId: true,
        createdAt: true,
        revealedLabel: true,
        variant: { select: { label: true } },
        liveRoom: { select: { title: true } },
      },
    }),
    prisma.liveShippingSessionItem.findMany({
      where: { session: { buyerId }, order: { createdAt: { gte: since } } },
      orderBy: { createdAt: "desc" },
      take,
      select: {
        order: { select: { id: true, createdAt: true, listing: { select: { title: true } } } },
        session: { select: { liveShowId: true, liveShow: { select: { title: true } } } },
      },
    }),
  ]);
  const byKey = new Map<string, WinListEntry>();
  for (const w of saved) {
    byKey.set(`${w.kind}:${w.refId}`, {
      kind: w.kind as WinClipKind,
      id: w.refId,
      title: w.title,
      subtitle: w.subtitle,
      showTitle: w.showTitle,
      at: w.momentAt.toISOString(),
      liveRoomId: w.liveRoomId,
    });
  }
  for (const p of spots) {
    byKey.set(`spot:${p.id}`, {
      kind: "spot",
      id: p.id,
      title: p.revealedLabel || p.variant.label,
      subtitle: "Spot claimed",
      showTitle: p.liveRoom.title ?? null,
      at: p.createdAt.toISOString(),
      liveRoomId: p.liveRoomId,
    });
  }
  for (const o of orders) {
    byKey.set(`order:${o.order.id}`, {
      kind: "order",
      id: o.order.id,
      title: o.order.listing.title,
      subtitle: "Item won",
      showTitle: o.session.liveShow.title ?? null,
      at: o.order.createdAt.toISOString(),
      liveRoomId: o.session.liveShowId,
    });
  }
  return [...byKey.values()].sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, take);
}

async function listPrefixes(client: S3Client, bucket: string, prefix: string): Promise<string[]> {
  const out: string[] = [];
  let token: string | undefined;
  do {
    const page = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, Delimiter: "/", ContinuationToken: token }),
    );
    for (const p of page.CommonPrefixes ?? []) if (p.Prefix) out.push(p.Prefix);
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return out;
}

async function readText(client: S3Client, bucket: string, key: string): Promise<string | null> {
  try {
    const got = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    return (await got.Body?.transformToString()) ?? null;
  } catch {
    return null;
  }
}

/** Session folders (`.../YYYY/M/D/H/m/<id>/`) for a channel on the days around the moment. */
async function candidateSessions(client: S3Client, bucket: string, channelBase: string, momentMs: number) {
  const out: string[] = [];
  for (const dayPrefix of recordingDayPrefixes(channelBase, momentMs, 2)) {
    const hours = await listPrefixes(client, bucket, dayPrefix);
    for (const h of hours) {
      const minutes = await listPrefixes(client, bucket, h);
      for (const m of minutes) out.push(...(await listPrefixes(client, bucket, m)));
    }
  }
  return out;
}

export type BuiltWinClip = {
  playlist: string;
  momentOffsetSec: number;
  durationSec: number;
  fromArchive: boolean;
};

type ClipCut = { selection: ClipSelection; dir: string };

function archivePrefix(kind: WinClipKind, id: string): string {
  return `clips/${kind}/${id}/`;
}

/** Find the recording that covers the moment and pick the segments for the clip (no signing / copying). */
async function findClipCut(client: S3Client, bucket: string, moment: WinMoment): Promise<ClipCut | null> {
  const arns = await channelArnsForRoom(moment.liveRoomId);
  for (const arn of arns) {
    const base = channelS3Base(arn);
    if (!base) continue;
    const sessions = await candidateSessions(client, bucket, base, moment.momentMs);
    for (const sessionPrefix of sessions) {
      for (const rendition of RENDITIONS) {
        const dir = `${sessionPrefix}media/hls/${rendition}/`;
        const text = await readText(client, bucket, `${dir}playlist.m3u8`);
        if (!text) continue;
        const selection = selectClipSegments(parseMediaPlaylist(text), moment.momentMs);
        if (!selection) break; // right rendition, wrong session
        return { selection, dir };
      }
    }
  }
  return null;
}

/** Playlist for a win: the permanently saved copy when it exists, otherwise cut live from the recording. */
export async function buildWinClipPlaylist(moment: WinMoment): Promise<BuiltWinClip | null> {
  const client = makeS3Client();
  const bucket = recordingsBucket();

  const saved = await prisma.winClipSave.findUnique({
    where: { kind_refId: { kind: moment.kind, refId: moment.id } },
  });
  if (saved?.status === "saved" && saved.s3Prefix) {
    const text = await readText(client, bucket, `${saved.s3Prefix}playlist.m3u8`);
    if (text) {
      const lines = await Promise.all(
        text.split(/\r?\n/).map(async (line) => {
          const t = line.trim();
          if (!t || t.startsWith("#")) return line;
          return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: `${saved.s3Prefix}${t}` }), {
            expiresIn: SEGMENT_URL_TTL_SECONDS,
          });
        }),
      );
      return {
        playlist: `${lines.join("\n")}\n`,
        momentOffsetSec: saved.momentOffsetSec ?? 0,
        durationSec: saved.durationSec ?? 0,
        fromArchive: true,
      };
    }
  }

  const cut = await findClipCut(client, bucket, moment);
  if (!cut) return null;
  const urls = new Map<string, string>();
  await Promise.all(
    cut.selection.segments.map(async (s) => {
      urls.set(
        s.uri,
        await getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: `${cut.dir}${s.uri}` }), {
          expiresIn: SEGMENT_URL_TTL_SECONDS,
        }),
      );
    }),
  );
  return {
    playlist: buildClipPlaylist(cut.selection.segments, (u) => urls.get(u) ?? u),
    momentOffsetSec: cut.selection.momentOffsetSec,
    durationSec: cut.selection.durationSec,
    fromArchive: false,
  };
}

/**
 * Copy the clip's segments into `clips/…` (outside the 30-day recording lifecycle rule) and record it.
 * Returns "saved", or "missing" when the recording does not cover the moment (retried a few times).
 */
export async function archiveWinClip(moment: WinMoment): Promise<"saved" | "missing"> {
  const client = makeS3Client();
  const bucket = recordingsBucket();
  const key = { kind_refId: { kind: moment.kind, refId: moment.id } };
  const base = {
    buyerId: moment.buyerId,
    liveRoomId: moment.liveRoomId,
    title: moment.title,
    subtitle: moment.subtitle,
    showTitle: moment.showTitle,
    momentAt: new Date(moment.momentMs),
  };

  const cut = await findClipCut(client, bucket, moment);
  if (!cut) {
    await prisma.winClipSave.upsert({
      where: key,
      create: { kind: moment.kind, refId: moment.id, ...base, status: "missing", attempts: 1 },
      update: { status: "missing", attempts: { increment: 1 } },
    });
    return "missing";
  }

  const prefix = archivePrefix(moment.kind, moment.id);
  for (const seg of cut.selection.segments) {
    await client.send(
      new CopyObjectCommand({
        Bucket: bucket,
        CopySource: `${bucket}/${cut.dir}${seg.uri}`,
        Key: `${prefix}${seg.uri}`,
        MetadataDirective: "COPY",
      }),
    );
  }
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: `${prefix}playlist.m3u8`,
      Body: buildClipPlaylist(cut.selection.segments, (u) => u),
      ContentType: "application/vnd.apple.mpegurl",
    }),
  );
  await prisma.winClipSave.upsert({
    where: key,
    create: {
      kind: moment.kind,
      refId: moment.id,
      ...base,
      status: "saved",
      attempts: 1,
      s3Prefix: prefix,
      momentOffsetSec: cut.selection.momentOffsetSec,
      durationSec: cut.selection.durationSec,
    },
    update: {
      status: "saved",
      s3Prefix: prefix,
      momentOffsetSec: cut.selection.momentOffsetSec,
      durationSec: cut.selection.durationSec,
      attempts: { increment: 1 },
    },
  });
  return "saved";
}

type PendingRow = { id: string };

/**
 * Cron: save clips for recent wins that have no permanent copy yet. A clip only needs the moment
 * plus ~30s of video to exist, so this runs minutes after the purchase, not after the show ends.
 */
export async function archivePendingWinClips(limit = 8): Promise<{ saved: number; missing: number; errors: number }> {
  const spots = await prisma.$queryRaw<PendingRow[]>`
    SELECT p.id FROM "LiveItemVariantPurchase" p
    LEFT JOIN "WinClipSave" w ON w.kind = 'spot' AND w."refId" = p.id
    WHERE p."paymentStatus" = 'paid'
      AND p."createdAt" > now() - interval '28 days'
      AND p."createdAt" < now() - interval '3 minutes'
      AND (w.id IS NULL OR (w.status = 'missing' AND w.attempts < 4 AND w."updatedAt" < now() - interval '30 minutes'))
    ORDER BY p."createdAt" DESC
    LIMIT ${limit}`;
  const orders = await prisma.$queryRaw<PendingRow[]>`
    SELECT i."orderId" AS id FROM "LiveShippingSessionItem" i
    JOIN "Order" o ON o.id = i."orderId"
    LEFT JOIN "WinClipSave" w ON w.kind = 'order' AND w."refId" = i."orderId"
    WHERE o."createdAt" > now() - interval '28 days'
      AND o."createdAt" < now() - interval '3 minutes'
      AND (w.id IS NULL OR (w.status = 'missing' AND w.attempts < 4 AND w."updatedAt" < now() - interval '30 minutes'))
    ORDER BY o."createdAt" DESC
    LIMIT ${limit}`;

  const work: { kind: WinClipKind; id: string }[] = [
    ...spots.map((r) => ({ kind: "spot" as const, id: r.id })),
    ...orders.map((r) => ({ kind: "order" as const, id: r.id })),
  ].slice(0, limit);

  const out = { saved: 0, missing: 0, errors: 0 };
  for (const w of work) {
    try {
      const moment = await loadWinMoment(w.kind, w.id);
      if (!moment) continue;
      const result = await archiveWinClip(moment);
      out[result] += 1;
    } catch (e) {
      out.errors += 1;
      console.error("[win-clip] archive failed", w, e instanceof Error ? e.message : String(e));
    }
  }
  return out;
}

export function makeWinClipPlaylistToken(moment: WinMoment): { token: string; expiresAt: string } {
  const exp = Date.now() + TOKEN_TTL_MS;
  return {
    token: signWinClipToken({ k: moment.kind, id: moment.id, u: moment.buyerId, exp }, tokenSecret()),
    expiresAt: new Date(exp).toISOString(),
  };
}

export function readWinClipPlaylistToken(token: string) {
  return verifyWinClipToken(token, tokenSecret());
}
