import { NextResponse } from "next/server";
import { resolveAccountUserId } from "@/lib/resolve-account-auth";
import { prisma } from "@/lib/prisma";
import { ensurePrismaAvatarFromSupabase, syncSupabaseProfileAvatar } from "@/lib/sync-profile-avatar";
import { syncSupabaseProfileUsername } from "@/lib/sync-profile-username";

type PatchBody = {
  /** @deprecated Ignored — display name is always the username. */
  name?: unknown;
  image?: unknown;
};

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
  const auth = await resolveAccountUserId(req);
  if (auth instanceof NextResponse) return auth;

  let user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { username: true, name: true, image: true },
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
    },
  });
}

export async function PATCH(req: Request) {
  const auth = await resolveAccountUserId(req);
  if (auth instanceof NextResponse) return auth;

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const image = trimImageUrl(body.image);

  const existing = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { username: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }

  // Display name is not editable — always pin Prisma `name` to username.
  const data: { name: string; image?: string | null } = { name: existing.username };
  if (image !== undefined) data.image = image;

  const user = await prisma.user.update({
    where: { id: auth.userId },
    data,
    select: { name: true, image: true, username: true },
  });

  if (image !== undefined) {
    await syncSupabaseProfileAvatar(auth.userId, image);
  }
  await syncSupabaseProfileUsername(auth.userId, user.username);

  return NextResponse.json({
    user: {
      username: user.username,
      name: user.username,
      image: user.image,
    },
  });
}
