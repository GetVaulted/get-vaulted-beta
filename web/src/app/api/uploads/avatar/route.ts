/**
 * Profile avatar uploads → Supabase Storage `avatars/{authUserId}/avatar.jpg` (service role).
 * Prefer this over `/api/uploads/listing-image` so seller/profile photos are not listing media.
 */
import { NextResponse } from "next/server";
import { getServerSessionSafe } from "@/lib/auth";
import { requestHasSupabaseBearer } from "@/lib/mobile-supabase-bearer";
import { prisma } from "@/lib/prisma";
import { requireUserIdFromSupabaseBearer } from "@/lib/require-supabase-bearer";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  isSupabaseAvatarStorageConfigured,
  uploadAvatarToSupabase,
} from "@/lib/supabase-avatar-storage";
import { resolveSupabaseAuthUserId } from "@/lib/sync-profile-avatar";

export const runtime = "nodejs";

const ALLOWED = new Map<string, string>([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

const MAX_BYTES = 5 * 1024 * 1024;

function mimeFromFilename(name: string): string | null {
  const lower = name.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  return null;
}

function readUploadedImage(form: FormData): { blob: Blob; mime: string; size: number } | null {
  const raw = form.get("file");
  if (!(raw instanceof Blob)) return null;
  const filename = raw instanceof File && raw.name.trim() ? raw.name.trim() : "avatar.jpg";
  let mime = raw.type?.trim() ?? "";
  if (!mime || mime === "application/octet-stream") {
    mime = mimeFromFilename(filename) ?? "";
  }
  if (!ALLOWED.has(mime)) return null;
  return { blob: raw, mime, size: raw.size };
}

function magicMatches(buf: Buffer, mime: string): boolean {
  if (buf.length < 12) return false;
  if (mime === "image/jpeg") return buf[0] === 0xff && buf[1] === 0xd8;
  if (mime === "image/png") {
    return (
      buf[0] === 0x89 &&
      buf[1] === 0x50 &&
      buf[2] === 0x4e &&
      buf[3] === 0x47 &&
      buf[4] === 0x0d &&
      buf[5] === 0x0a &&
      buf[6] === 0x1a &&
      buf[7] === 0x0a
    );
  }
  if (mime === "image/webp") {
    return buf.slice(0, 4).toString("ascii") === "RIFF" && buf.slice(8, 12).toString("ascii") === "WEBP";
  }
  return false;
}

async function resolveAvatarAuthUserId(req: Request): Promise<{ authUserId: string } | NextResponse> {
  if (requestHasSupabaseBearer(req)) {
    const auth = await requireUserIdFromSupabaseBearer(req);
    if (auth instanceof NextResponse) return auth;
    return { authUserId: auth.supabaseAuthUserId };
  }

  const session = await getServerSessionSafe();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const row = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { email: true, username: true },
  });
  const authUserId = await resolveSupabaseAuthUserId(admin, session.user.id, {
    email: row?.email ?? session.user.email,
    username: row?.username ?? session.user.username,
  });
  if (!authUserId) {
    return NextResponse.json(
      { error: "Could not resolve your account for avatar upload. Sign out and back in, then try again." },
      { status: 400 },
    );
  }
  return { authUserId };
}

export async function POST(req: Request) {
  if (!isSupabaseAvatarStorageConfigured()) {
    return NextResponse.json({ error: "Avatar storage is not configured." }, { status: 503 });
  }

  const auth = await resolveAvatarAuthUserId(req);
  if (auth instanceof NextResponse) return auth;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = readUploadedImage(form);
  if (!file) {
    return NextResponse.json(
      { error: "Missing file or invalid type. Use JPG, PNG, or WebP." },
      { status: 400 },
    );
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File must be 5MB or smaller." }, { status: 400 });
  }

  const buf = Buffer.from(await file.blob.arrayBuffer());
  if (!magicMatches(buf, file.mime)) {
    return NextResponse.json({ error: "File does not match its type." }, { status: 400 });
  }

  // Always store as JPEG path for stable public URL; content-type may still be png/webp.
  const uploaded = await uploadAvatarToSupabase(auth.authUserId, buf, file.mime);
  if (!uploaded.ok) {
    return NextResponse.json({ error: uploaded.message }, { status: 502 });
  }
  return NextResponse.json({ url: uploaded.publicUrl });
}
