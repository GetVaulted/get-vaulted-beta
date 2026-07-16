/**
 * Profile avatar uploads → Supabase Storage `avatars/{authUserId}/avatar.jpg` (service role).
 * Prefer this over `/api/uploads/listing-image` so seller/profile photos are not listing media.
 *
 * Mobile profile edit awaits this request with no reliable abort on multipart uploads, so this
 * handler must return (or fail) quickly: JWT-only auth, bounded form parse/upload, and
 * non-blocking profile URL persistence.
 */
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getServerSessionSafe } from "@/lib/auth";
import { getSupabaseBearerJwt, requestHasSupabaseBearer } from "@/lib/mobile-supabase-bearer";
import { prisma } from "@/lib/prisma";
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
const AUTH_MS = 8_000;
const FORM_MS = 12_000;
const PERSIST_MS = 6_000;

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

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Validate bearer JWT only — do not await Prisma ensure / Stripe sibling sync. */
async function resolveMobileAuthUserId(req: Request): Promise<string | NextResponse> {
  const jwt = getSupabaseBearerJwt(req);
  if (!jwt) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!url?.trim() || !anonKey?.trim()) {
    return NextResponse.json({ error: "Server misconfigured (Supabase URL/key)." }, { status: 500 });
  }

  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const { data, error } = await withTimeout(supabase.auth.getUser(jwt), AUTH_MS, "avatar auth");
    if (error || !data.user?.id) {
      return NextResponse.json({ error: "Invalid or expired session" }, { status: 401 });
    }
    return data.user.id;
  } catch (e) {
    console.error("[uploads/avatar] auth failed", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Auth timed out. Try again." }, { status: 504 });
  }
}

async function resolveWebSessionAuthUserId(): Promise<{ authUserId: string; prismaUserId: string } | NextResponse> {
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
  const authUserId = await withTimeout(
    resolveSupabaseAuthUserId(admin, session.user.id, {
      email: row?.email ?? session.user.email,
      username: row?.username ?? session.user.username,
    }),
    AUTH_MS,
    "avatar resolve auth id",
  );
  if (!authUserId) {
    return NextResponse.json(
      { error: "Could not resolve your account for avatar upload. Sign out and back in, then try again." },
      { status: 400 },
    );
  }
  return { authUserId, prismaUserId: session.user.id };
}

/** Best-effort: write public URL to profiles + Prisma so follow-up mobile sync is redundant. */
async function persistAvatarPublicUrl(args: {
  authUserId: string;
  prismaUserId?: string;
  publicUrl: string;
}): Promise<void> {
  const admin = getSupabaseAdminClient();
  if (admin) {
    const { error } = await admin
      .from("profiles")
      .update({ avatar_url: args.publicUrl })
      .eq("id", args.authUserId);
    if (error) {
      console.warn("[uploads/avatar] profiles update failed", error.message);
    }
  }

  const prismaIds = [...new Set([args.prismaUserId, args.authUserId].filter(Boolean))] as string[];
  for (const id of prismaIds) {
    try {
      await prisma.user.updateMany({
        where: { id },
        data: { image: args.publicUrl },
      });
    } catch (e) {
      console.warn("[uploads/avatar] prisma image update failed", {
        id,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
}

export async function POST(req: Request) {
  if (!isSupabaseAvatarStorageConfigured()) {
    return NextResponse.json({ error: "Avatar storage is not configured." }, { status: 503 });
  }

  let authUserId: string;
  let prismaUserId: string | undefined;

  try {
    if (requestHasSupabaseBearer(req)) {
      const mobileAuth = await resolveMobileAuthUserId(req);
      if (mobileAuth instanceof NextResponse) return mobileAuth;
      authUserId = mobileAuth;
      prismaUserId = mobileAuth;
    } else {
      const webAuth = await resolveWebSessionAuthUserId();
      if (webAuth instanceof NextResponse) return webAuth;
      authUserId = webAuth.authUserId;
      prismaUserId = webAuth.prismaUserId;
    }
  } catch (e) {
    console.error("[uploads/avatar] resolve auth failed", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Could not verify session. Try again." }, { status: 504 });
  }

  let form: FormData;
  try {
    form = await withTimeout(req.formData(), FORM_MS, "avatar formData");
  } catch (e) {
    console.error("[uploads/avatar] formData failed", e instanceof Error ? e.message : e);
    return NextResponse.json(
      { error: "Upload timed out while reading the photo. Try a smaller image." },
      { status: 504 },
    );
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
  const uploaded = await uploadAvatarToSupabase(authUserId, buf, file.mime);
  if (!uploaded.ok) {
    return NextResponse.json({ error: uploaded.message }, { status: 502 });
  }

  // Do not block the mobile spinner on secondary writes / auth metadata.
  void withTimeout(
    persistAvatarPublicUrl({
      authUserId,
      prismaUserId,
      publicUrl: uploaded.publicUrl,
    }),
    PERSIST_MS,
    "avatar persist",
  ).catch((e) => {
    console.warn("[uploads/avatar] persist skipped", e instanceof Error ? e.message : e);
  });

  return NextResponse.json({ url: uploaded.publicUrl });
}
