/**
 * Listing image uploads: Supabase Storage when configured, otherwise `public/uploads/listings/`
 * (local dev). Response is always `{ url }`. Never use the service role key on the client.
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

export const runtime = "nodejs";

const ALLOWED = new Map<string, string>([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

const MAX_BYTES = 8 * 1024 * 1024;

function mimeFromFilename(name: string): string | null {
  const lower = name.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  return null;
}

/** React Native multipart uploads may arrive as Blob (not File) with an empty or generic MIME type. */
function readUploadedImage(form: FormData): { blob: Blob; mime: string; size: number } | null {
  const raw = form.get("file");
  if (!(raw instanceof Blob)) return null;
  const filename = raw instanceof File && raw.name.trim() ? raw.name.trim() : "upload.jpg";
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
    return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 && buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a;
  }
  if (mime === "image/webp") {
    return buf.slice(0, 4).toString("ascii") === "RIFF" && buf.slice(8, 12).toString("ascii") === "WEBP";
  }
  return false;
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

  const file = readUploadedImage(form);
  if (!file) {
    return NextResponse.json(
      { error: "Missing file or invalid type. Use JPG, PNG, or WebP." },
      { status: 400 },
    );
  }

  const ext = ALLOWED.get(file.mime)!;

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File must be 8MB or smaller." }, { status: 400 });
  }

  const buf = Buffer.from(await file.blob.arrayBuffer());
  if (!magicMatches(buf, file.mime)) {
    return NextResponse.json({ error: "File does not match its type." }, { status: 400 });
  }

  const name = `${randomUUID()}.${ext}`;

  if (isSupabaseListingImageStorageConfigured()) {
    const uploaded = await uploadListingImageToSupabase(name, buf, file.mime);
    if (!uploaded.ok) {
      return NextResponse.json({ error: uploaded.message }, { status: 502 });
    }
    return NextResponse.json({ url: uploaded.publicUrl });
  }

  const dir = join(process.cwd(), "public", "uploads", "listings");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, name), buf);

  const url = `/uploads/listings/${name}`;
  return NextResponse.json({ url });
}
