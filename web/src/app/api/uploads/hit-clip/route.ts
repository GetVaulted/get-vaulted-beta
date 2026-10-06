/**
 * Short Hit Clip uploads (MP4/MOV, ≤15s). Stored under `hit-clips/` in listing-images
 * (or local public/uploads/hit-clips when Supabase is not configured).
 */
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import {
  HIT_CLIP_ALLOWED_MIME,
  HIT_CLIP_MAX_BYTES,
  bufferLooksLikeMp4Family,
  mimeFromHitClipFilename,
  normalizeHitClipDurationMs,
  validateHitClipDurationMs,
} from "@/lib/hit-clip";
import { resolveListingsUserId } from "@/lib/resolve-listings-auth";
import {
  isSupabaseListingImageStorageConfigured,
  uploadListingImageToSupabase,
} from "@/lib/supabase-listing-storage";

export const runtime = "nodejs";

function readUploadedVideo(form: FormData): { blob: Blob; mime: string; size: number } | null {
  const raw = form.get("file");
  if (!(raw instanceof Blob)) return null;
  const filename = raw instanceof File && raw.name.trim() ? raw.name.trim() : "hit-clip.mp4";
  let mime = raw.type?.trim() ?? "";
  if (!mime || mime === "application/octet-stream") {
    mime = mimeFromHitClipFilename(filename) ?? "";
  }
  if (!HIT_CLIP_ALLOWED_MIME.has(mime)) return null;
  return { blob: raw, mime, size: raw.size };
}

export async function POST(req: Request) {
  const auth = await resolveListingsUserId(req);
  if (auth instanceof NextResponse) return auth;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = readUploadedVideo(form);
  if (!file) {
    return NextResponse.json(
      { error: "Missing file or invalid type. Use MP4 or MOV (max 15 seconds)." },
      { status: 400 },
    );
  }

  if (file.size > HIT_CLIP_MAX_BYTES) {
    return NextResponse.json({ error: "Hit clip must be 40MB or smaller." }, { status: 400 });
  }

  const durationMs = normalizeHitClipDurationMs(form.get("durationMs"));
  if (durationMs == null) {
    return NextResponse.json({ error: "durationMs is required." }, { status: 400 });
  }
  const durationCheck = validateHitClipDurationMs(durationMs);
  if (!durationCheck.ok) {
    return NextResponse.json({ error: durationCheck.error }, { status: 400 });
  }

  const buf = Buffer.from(await file.blob.arrayBuffer());
  if (!bufferLooksLikeMp4Family(buf)) {
    return NextResponse.json({ error: "File does not look like a valid video." }, { status: 400 });
  }

  const ext = HIT_CLIP_ALLOWED_MIME.get(file.mime)!;
  const name = `hit-clips/${randomUUID()}.${ext}`;

  if (isSupabaseListingImageStorageConfigured()) {
    const uploaded = await uploadListingImageToSupabase(name, buf, file.mime);
    if (!uploaded.ok) {
      return NextResponse.json({ error: uploaded.message }, { status: 502 });
    }
    return NextResponse.json({ url: uploaded.publicUrl, durationMs });
  }

  const dir = join(process.cwd(), "public", "uploads", "hit-clips");
  await mkdir(dir, { recursive: true });
  const localName = `${randomUUID()}.${ext}`;
  await writeFile(join(dir, localName), buf);
  return NextResponse.json({ url: `/uploads/hit-clips/${localName}`, durationMs });
}
