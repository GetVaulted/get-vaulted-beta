import { NextResponse } from "next/server";
import { resolveAccountUserId } from "@/lib/resolve-account-auth";
import { prisma } from "@/lib/prisma";

type PatchBody = {
  name?: unknown;
  image?: unknown;
};

function trimOptional(s: unknown, max: number): string | null | undefined {
  if (s === undefined) return undefined;
  if (typeof s !== "string") return undefined;
  const t = s.trim();
  if (!t) return null;
  return t.slice(0, max);
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

export async function PATCH(req: Request) {
  const auth = await resolveAccountUserId(req);
  if (auth instanceof NextResponse) return auth;

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = trimOptional(body.name, 120);
  const image = trimImageUrl(body.image);
  const data: { name?: string | null; image?: string | null } = {};
  if (name !== undefined) data.name = name;
  if (image !== undefined) data.image = image;

  if (!Object.keys(data).length) {
    return NextResponse.json({ error: "No valid profile fields to update." }, { status: 400 });
  }

  const user = await prisma.user.update({
    where: { id: auth.userId },
    data,
    select: { name: true, image: true, username: true },
  });

  return NextResponse.json({ user });
}
