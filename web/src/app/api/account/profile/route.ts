import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { resolveAccountUserId } from "@/lib/resolve-account-auth";
import { prisma } from "@/lib/prisma";
import {
  normalizeProfileBannerUrl,
  normalizeProfileBio,
  normalizeProfileLinks,
  profileLinksFromStored,
} from "@/lib/seller-profile-fields";
import { ensurePrismaAvatarFromSupabase, syncSupabaseProfileAvatar } from "@/lib/sync-profile-avatar";

type PatchBody = {
  /** @deprecated Ignored — display name is always the username. */
  name?: unknown;
  image?: unknown;
  /** Public bio (max 280 chars). `null` / blank clears it. */
  bio?: unknown;
  /** Public banner image URL. `null` / blank clears it. */
  bannerUrl?: unknown;
  /** `{ instagram, tiktok, youtube, x, website }` handles or URLs. `null` clears all. */
  links?: unknown;
};

type PublicProfileFields = {
  profileBio: string | null;
  profileBannerUrl: string | null;
  profileLinks: unknown;
};

function profileFieldsPayload(u: PublicProfileFields) {
  const links: Record<string, string> = {};
  for (const l of profileLinksFromStored(u.profileLinks)) links[l.key] = l.url;
  return { bio: u.profileBio, bannerUrl: u.profileBannerUrl, links };
}

function trimImageUrl(s: unknown): string | null | undefined {
  if (s === undefined) return undefined;
  if (typeof s !== "string") return undefined;
  const t = s.trim();
  if (!t) return null;
  if (!t.startsWith("http://") && !t.startsWith("https://") && !t.startsWith("/")) {
    return undefined;
  }
  return t.slice(0, 2048);
}

export async function GET(req: Request) {
  // Hydrate is best-effort; skip Stripe sibling sync (not needed for profile read).
  const auth = await resolveAccountUserId(req, { skipStripeSiblingSync: true });
  if (auth instanceof NextResponse) return auth;

  let user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: {
      username: true,
      name: true,
      image: true,
      profileBio: true,
      profileBannerUrl: true,
      profileLinks: true,
    },
  });
  if (!user) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }

  if (!user.image?.trim()) {
    try {
      const hydrated = await ensurePrismaAvatarFromSupabase(auth.userId);
      if (hydrated) {
        user = { ...user, image: hydrated };
      }
    } catch (e) {
      console.error("[account/profile GET] avatar hydrate failed", e);
    }
  }

  // Public identity is username only — keep `name` aligned for legacy clients.
  return NextResponse.json({
    user: {
      username: user.username,
      name: user.username,
      image: user.image,
      ...profileFieldsPayload(user),
    },
  });
}

export async function PATCH(req: Request) {
  // Image-only mobile avatar sync — never block on Stripe Connect sibling copies.
  const auth = await resolveAccountUserId(req, { skipStripeSiblingSync: true });
  if (auth instanceof NextResponse) return auth;

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const image = trimImageUrl(body.image);
  const bio = normalizeProfileBio(body.bio);
  const bannerUrl = normalizeProfileBannerUrl(body.bannerUrl);
  const linksResult = normalizeProfileLinks(body.links);
  if (linksResult && !linksResult.ok) {
    return NextResponse.json({ error: linksResult.error, field: linksResult.key }, { status: 400 });
  }
  if (body.bio !== undefined && bio === undefined) {
    return NextResponse.json({ error: "Bio must be text." }, { status: 400 });
  }
  if (body.bannerUrl !== undefined && bannerUrl === undefined) {
    return NextResponse.json({ error: "Banner must be an http(s) image URL." }, { status: 400 });
  }
  if (
    image === undefined &&
    bio === undefined &&
    bannerUrl === undefined &&
    linksResult === undefined
  ) {
    return NextResponse.json({ error: "No valid profile fields to update." }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { username: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }

  // Image-only updates (mobile avatar sync). Keep Prisma `name` pinned to username without
  // calling username sync on every photo save — that was stalling mobile profile photo uploads.
  const user = await prisma.user.update({
    where: { id: auth.userId },
    data: {
      name: existing.username,
      ...(image !== undefined ? { image } : {}),
      ...(bio !== undefined ? { profileBio: bio } : {}),
      ...(bannerUrl !== undefined ? { profileBannerUrl: bannerUrl } : {}),
      ...(linksResult?.ok
        ? { profileLinks: linksResult.links ?? Prisma.DbNull }
        : {}),
    },
    select: {
      name: true,
      image: true,
      username: true,
      profileBio: true,
      profileBannerUrl: true,
      profileLinks: true,
    },
  });

  // Fire-and-forget: mobile already wrote Supabase profiles; do not keep the spinner waiting.
  if (image !== undefined) {
    void syncSupabaseProfileAvatar(auth.userId, image).catch((e) => {
      console.warn(
        "[account/profile PATCH] syncSupabaseProfileAvatar failed",
        e instanceof Error ? e.message : e,
      );
    });
  }

  return NextResponse.json({
    user: {
      username: user.username,
      name: user.username,
      image: user.image,
      ...profileFieldsPayload(user),
    },
  });
}
