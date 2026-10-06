/**
 * Seller "Pulls" photo uploads. Follows the listing-image / hit-clip upload pattern:
 * multipart FormData, `resolveListingsUserId` (web session or mobile bearer), service-role
 * upload into the shared `listing-images` bucket under a `pulls/` prefix (not a listing,
 * so a dedicated `pulls/` key keeps it out of any listing's own image set).
 */
import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveListingsUserId } from "@/lib/resolve-listings-auth";
import { PULL_PHOTO_MAX_BYTES, validatePullPhotoCount } from "@/lib/profile-media-requirements";
import {
  isSupabaseListingImageStorageConfigured,
  uploadListingImageToSupabase,
} from "@/lib/supabase-listing-storage";

export const runtime = "nodejs";

const ALLOWED = new Map<string, string>([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

function mimeFromFilename(name: string): string | null {
  const lower = name.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  return null;
}

function readUploadedImage(form: FormData): { blob: Blob; mime: string } | null {
  const raw = form.get("file");
  if (!(raw instanceof Blob)) return null;
  const filename = raw instanceof File && raw.name.trim() ? raw.name.trim() : "pull.jpg";
  let mime = raw.type?.trim() ?? "";
  if (!mime || mime === "application/octet-stream") {
    mime = mimeFromFilename(filename) ?? "";
  }
  if (!ALLOWED.has(mime)) return null;
  return { blob: raw, mime };
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

export async function POST(req: Request) {
  const auth = await resolveListingsUserId(req);
  if (auth instanceof NextResponse) return auth;

  if (!isSupabaseListingImageStorageConfigured()) {
    return NextResponse.json({ error: "Media storage is not configured." }, { status: 503 });
  }

  const existingCount = await prisma.profilePullMedia.count({
    where: { sellerId: auth.userId, type: "PHOTO" },
  });
  const countCheck = validatePullPhotoCount(existingCount);
  if (!countCheck.ok) {
    return NextResponse.json({ error: countCheck.error }, { status: 409 });
  }

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

  const buf = Buffer.from(await file.blob.arrayBuffer());
  if (buf.length > PULL_PHOTO_MAX_BYTES) {
    return NextResponse.json({ error: "Photo must be 10MB or smaller." }, { status: 400 });
  }
  if (!magicMatches(buf, file.mime)) {
    return NextResponse.json({ error: "File does not match its type." }, { status: 400 });
  }

  const ext = ALLOWED.get(file.mime)!;
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
      type: "PHOTO",
      url: uploaded.publicUrl,
      byteSize: buf.length,
      sortOrder: (maxSortOrder._max.sortOrder ?? -1) + 1,
    },
  });

  return NextResponse.json({ media: row });
}
