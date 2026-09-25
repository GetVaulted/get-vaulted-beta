/**
 * Seller "Pulls" video uploads (MP4/MOV, <=20s, <=30MB). Same shape as
 * `/api/uploads/hit-clip`: multipart FormData, client-reported `durationMs` (trusted,
 * same trust model as HitClip — no ffprobe in this codebase), MP4-family magic-byte
 * sniffing reused from `hit-clip.ts`. Stored in the shared `listing-images` bucket
 * under `pulls/` (not tied to a listing or a live room, unlike HitClip).
 */
import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { bufferLooksLikeMp4Family, mimeFromHitClipFilename } from "@/lib/hit-clip";
import { prisma } from "@/lib/prisma";
import { resolveListingsUserId } from "@/lib/resolve-listings-auth";
import {
  PULL_VIDEO_MAX_BYTES,
  validatePullVideoBytes,
  validatePullVideoCount,
  validatePullVideoDurationMs,
} from "@/lib/profile-media-requirements";
import {
  isSupabaseListingImageStorageConfigured,
  uploadListingImageToSupabase,
} from "@/lib/supabase-listing-storage";

export const runtime = "nodejs";

const ALLOWED_MIME = new Map<string, string>([
  ["video/mp4", "mp4"],
  ["video/quicktime", "mov"],
]);

function readUploadedVideo(form: FormData): { blob: Blob; mime: string } | null {
  const raw = form.get("file");
  if (!(raw instanceof Blob)) return null;
  const filename = raw instanceof File && raw.name.trim() ? raw.name.trim() : "pull.mp4";
  let mime = raw.type?.trim() ?? "";
  if (!mime || mime === "application/octet-stream") {
    mime = mimeFromHitClipFilename(filename) ?? "";
  }
  if (!ALLOWED_MIME.has(mime)) return null;
  return { blob: raw, mime };
}

function normalizeDurationMs(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

export async function POST(req: Request) {
  const auth = await resolveListingsUserId(req);
  if (auth instanceof NextResponse) return auth;

  if (!isSupabaseListingImageStorageConfigured()) {
    return NextResponse.json({ error: "Media storage is not configured." }, { status: 503 });
  }

  const existingCount = await prisma.profilePullMedia.count({
    where: { sellerId: auth.userId, type: "VIDEO" },
  });
  const countCheck = validatePullVideoCount(existingCount);
  if (!countCheck.ok) {
    return NextResponse.json({ error: countCheck.error }, { status: 409 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = readUploadedVideo(form);
  if (!file) {
    return NextResponse.json(
      { error: "Missing file or invalid type. Use MP4 or MOV (max 20 seconds)." },
      { status: 400 },
    );
  }

  const durationMs = normalizeDurationMs(form.get("durationMs"));
  if (durationMs == null) {
    return NextResponse.json({ error: "durationMs is required." }, { status: 400 });
  }
  const durationCheck = validatePullVideoDurationMs(durationMs);
  if (!durationCheck.ok) {
    return NextResponse.json({ error: durationCheck.error }, { status: 400 });
  }

  const buf = Buffer.from(await file.blob.arrayBuffer());
  const byteCheck = validatePullVideoBytes(buf.length);
  if (!byteCheck.ok) {
    return NextResponse.json({ error: byteCheck.error }, { status: 400 });
  }
  if (buf.length > PULL_VIDEO_MAX_BYTES) {
    return NextResponse.json({ error: "Pull video must be 30MB or smaller." }, { status: 400 });
  }
  if (!bufferLooksLikeMp4Family(buf)) {
    return NextResponse.json({ error: "File does not look like a valid video." }, { status: 400 });
  }

  const ext = ALLOWED_MIME.get(file.mime)!;
  const id = randomUUID();
  const objectKey = `pulls/${id}.${ext}`;

  const uploaded = await uploadListingImageToSupabase(objectKey, buf, file.mime);
  if (!uploaded.ok) {
    return NextResponse.json({ error: uploaded.message }, { status: 502 });
  }

  const maxSortOrder = await prisma.profilePullMedia.aggregate({
    where: { sellerId: auth.userId },
    _max: { sortOrder: true },
  });

  const row = await prisma.profilePullMedia.create({
    data: {
      id,
      sellerId: auth.userId,
      type: "VIDEO",
      url: uploaded.publicUrl,
      durationMs,
      byteSize: buf.length,
      sortOrder: (maxSortOrder._max.sortOrder ?? -1) + 1,
    },
  });

  return NextResponse.json({ media: row });
}
