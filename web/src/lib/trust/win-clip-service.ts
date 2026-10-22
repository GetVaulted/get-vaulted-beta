import { GetObjectCommand, ListObjectsV2Command, type S3Client } from "@aws-sdk/client-s3";
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
export async function loadWinMoment(kind: WinClipKind, id: string, buyerId: string): Promise<WinMoment | null> {
  if (kind === "spot") {
    const p = await prisma.liveItemVariantPurchase.findFirst({
      where: { id, buyerId, paymentStatus: "paid" },
      select: {
        id: true,
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
      buyerId,
      liveRoomId: p.liveRoomId,
      momentMs: when.getTime(),
      title: p.revealedLabel || p.variant.label,
      subtitle: "Spot claimed",
      showTitle: p.liveRoom.title ?? null,
    };
  }
  const item = await prisma.liveShippingSessionItem.findFirst({
    where: { orderId: id, session: { buyerId } },
    select: {
      order: { select: { id: true, createdAt: true, listing: { select: { title: true } } } },
      session: { select: { liveShowId: true, liveShow: { select: { title: true } } } },
    },
  });
  if (!item) return null;
  return {
    kind,
    id: item.order.id,
    buyerId,
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

/** Buyer's recent live wins that could have a video receipt (inside the 30-day recording window). */
export async function listBuyerWins(buyerId: string, take = 60): Promise<WinListEntry[]> {
  const since = replayRetentionCutoff();
  const [spots, orders] = await Promise.all([
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
  const rows: WinListEntry[] = [
    ...spots.map((p) => ({
      kind: "spot" as const,
      id: p.id,
      title: p.revealedLabel || p.variant.label,
      subtitle: "Spot claimed",
      showTitle: p.liveRoom.title ?? null,
      at: p.createdAt.toISOString(),
      liveRoomId: p.liveRoomId,
    })),
    ...orders.map((o) => ({
      kind: "order" as const,
      id: o.order.id,
      title: o.order.listing.title,
      subtitle: "Item won",
      showTitle: o.session.liveShow.title ?? null,
      at: o.order.createdAt.toISOString(),
      liveRoomId: o.session.liveShowId,
    })),
  ];
  rows.sort((a, b) => (a.at < b.at ? 1 : -1));
  return rows.slice(0, take);
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
  selection: ClipSelection;
  sessionPrefix: string;
};

/** Find the recording that covers the moment and cut a clip playlist with fresh pre-signed segment URLs. */
export async function buildWinClipPlaylist(moment: WinMoment): Promise<BuiltWinClip | null> {
  const client = makeS3Client();
  const bucket = recordingsBucket();
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
        const urls = new Map<string, string>();
        await Promise.all(
          selection.segments.map(async (s) => {
            urls.set(
              s.uri,
              await getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: `${dir}${s.uri}` }), {
                expiresIn: SEGMENT_URL_TTL_SECONDS,
              }),
            );
          }),
        );
        return {
          playlist: buildClipPlaylist(selection.segments, (u) => urls.get(u) ?? u),
          selection,
          sessionPrefix,
        };
      }
    }
  }
  return null;
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
