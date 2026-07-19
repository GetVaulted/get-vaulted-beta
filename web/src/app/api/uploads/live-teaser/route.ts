/**
 * Short live-room teaser uploads (MP4/MOV, ≤15s). Stored in the listing-images bucket
 * under `live-teasers/` when Supabase is configured, otherwise `public/uploads/live-teasers/`.
 */
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { resolveListingsUserId } from "@/lib/resolve-listings-auth";
import {
  isSupabaseListingImageStorageConfigured,
  uploadListingImageToSupabase,
} from "@/lib/supabase-listing-storage";
import {
  LIVE_TEASER_ALLOWED_MIME,
  LIVE_TEASER_MAX_BYTES,
  bufferLooksLikeMp4Family,
  mimeFromLiveTeaserFilename,
  normalizeTeaserDurationMs,
  validateTeaserDurationMs,
} from "@/lib/live-room-teaser";

export const runtime = "nodejs";

function readUploadedVideo(form: FormData): { blob: Blob; mime: string; size: number } | null {
  const raw = form.get("file");
  if (!(raw instanceof Blob)) return null;
  const filename = raw instanceof File && raw.name.trim() ? raw.name.trim() : "teaser.mp4";
  let mime = raw.type?.trim() ?? "";
  if (!mime || mime === "application/octet-stream") {
    mime = mimeFromLiveTeaserFilename(filename) ?? "";
  }
  if (!LIVE_TEASER_ALLOWED_MIME.has(mime)) return null;
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

  if (file.size > LIVE_TEASER_MAX_BYTES) {
    return NextResponse.json({ error: "Teaser video must be 40MB or smaller." }, { status: 400 });
  }

  const durationMs = normalizeTeaserDurationMs(form.get("durationMs"));
  if (durationMs == null) {
    return NextResponse.json({ error: "durationMs is required." }, { status: 400 });
  }
  const durationCheck = validateTeaserDurationMs(durationMs);
  if (!durationCheck.ok) {
    return NextResponse.json({ error: durationCheck.error }, { status: 400 });
  }

  const buf = Buffer.from(await file.blob.arrayBuffer());
  if (!bufferLooksLikeMp4Family(buf)) {
    return NextResponse.json({ error: "File does not look like a valid video." }, { status: 400 });
  }

  const ext = LIVE_TEASER_ALLOWED_MIME.get(file.mime)!;
  const name = `live-teasers/${randomUUID()}.${ext}`;

  if (isSupabaseListingImageStorageConfigured()) {
    const uploaded = await uploadListingImageToSupabase(name, buf, file.mime);
    if (!uploaded.ok) {
      return NextResponse.json({ error: uploaded.message }, { status: 502 });
    }
    return NextResponse.json({ url: uploaded.publicUrl, durationMs });
  }

  const dir = join(process.cwd(), "public", "uploads", "live-teasers");
  await mkdir(dir, { recursive: true });
  const localName = `${randomUUID()}.${ext}`;
  await writeFile(join(dir, localName), buf);
  return NextResponse.json({ url: `/uploads/live-teasers/${localName}`, durationMs });
}
