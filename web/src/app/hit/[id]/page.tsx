import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { buildHitClipShareCaption, canonicalHitClipShareUrl } from "@/lib/hit-clip";
import { canonicalShareSiteUrl, DEFAULT_LIVE_SHARE_OG_IMAGE } from "@/lib/live-room-share-metadata";
import { HitClipWatchClient } from "@/components/hit-clip/HitClipWatchClient";

export const dynamic = "force-dynamic";

async function loadClip(id: string) {
  return prisma.hitClip.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      description: true,
      thumbnailUrl: true,
      clipUrl: true,
      itemTitle: true,
      teamOrSpotLabel: true,
      shareCount: true,
      liveRoomId: true,
      seller: { select: { username: true, avatarUrl: true } },
      liveRoom: { select: { title: true, status: true } },
    },
  });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id: raw } = await params;
  const id = decodeURIComponent(raw ?? "");
  const clip = await loadClip(id);
  if (!clip) {
    return { title: "Hit Clip | Get Vaulted", description: "Watch hits on Get Vaulted." };
  }

  const shareUrl = canonicalHitClipShareUrl(clip.id);
  const title = `${clip.title} | Get Vaulted`;
  const description =
    clip.description?.trim() ||
    buildHitClipShareCaption({
      title: clip.title,
      sellerUsername: clip.seller.username,
      shareUrl,
    }).split("\n")[0]!;
  const image = clip.thumbnailUrl?.trim() || DEFAULT_LIVE_SHARE_OG_IMAGE;
  const video = clip.clipUrl?.trim() || undefined;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: shareUrl,
      type: "video.other",
      images: [{ url: image }],
      ...(video ? { videos: [{ url: video }] } : {}),
    },
    twitter: {
      card: video ? "player" : "summary_large_image",
      title,
      description,
      images: [image],
    },
    alternates: { canonical: shareUrl },
  };
}

export default async function HitClipPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const id = decodeURIComponent(raw ?? "");
  const clip = await loadClip(id);
  if (!clip) notFound();

  const shareUrl = canonicalHitClipShareUrl(clip.id);
  const liveHref = `${canonicalShareSiteUrl()}/live/${encodeURIComponent(clip.liveRoomId)}`;
  const caption = buildHitClipShareCaption({
    title: clip.title,
    sellerUsername: clip.seller.username,
    shareUrl,
  });

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="mx-auto flex w-full max-w-lg flex-col gap-5 px-4 pb-16 pt-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-400/90">Hit Clip</p>
        <h1 className="font-display text-3xl font-semibold leading-tight tracking-tight">{clip.title}</h1>
        <p className="text-sm text-white/65">
          @{clip.seller.username.replace(/^@/, "")}
          {clip.itemTitle ? ` · ${clip.itemTitle}` : null}
          {clip.teamOrSpotLabel ? ` · ${clip.teamOrSpotLabel}` : null}
        </p>

        <HitClipWatchClient
          clipId={clip.id}
          title={clip.title}
          clipUrl={clip.clipUrl}
          thumbnailUrl={clip.thumbnailUrl}
          shareUrl={shareUrl}
          shareCaption={caption}
        />

        <div className="flex flex-wrap gap-3 text-sm">
          <Link
            href={liveHref}
            className="rounded-full bg-white px-4 py-2 font-semibold text-black hover:bg-white/90"
          >
            {clip.liveRoom.status === "live" ? "Watch live" : "Open show"}
          </Link>
          <Link href="/" className="rounded-full border border-white/20 px-4 py-2 text-white/85 hover:bg-white/5">
            Get Vaulted
          </Link>
        </div>
      </div>
    </main>
  );
}
