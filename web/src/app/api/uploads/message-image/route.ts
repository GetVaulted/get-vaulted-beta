/**
 * Direct-message photo uploads → Supabase Storage `message-images/{userId}/{uuid}.{ext}`
 * (service role). Same dual-body pattern as `/api/uploads/avatar`: mobile sends JSON
 * `{ base64, contentType }` (RN multipart uploads hang and do not abort reliably), web may
 * send multipart FormData.
 */
import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { resolveAccountUserId } from "@/lib/resolve-account-auth";
import {
  isSupabaseMessageImageStorageConfigured,
  uploadMessageImageToSupabase,
} from "@/lib/supabase-message-image-storage";

export const runtime = "nodejs";

const ALLOWED = new Map<string, string>([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

const MAX_BYTES = 8 * 1024 * 1024;
const FORM_MS = 15_000;

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
  const filename = raw instanceof File && raw.name.trim() ? raw.name.trim() : "photo.jpg";
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

export async function POST(req: Request) {
  if (!isSupabaseMessageImageStorageConfigured()) {
    return NextResponse.json({ error: "Image storage is not configured." }, { status: 503 });
  }

  const auth = await resolveAccountUserId(req);
  if (auth instanceof NextResponse) return auth;
  const uid = auth.userId;

  let buf: Buffer;
  let mime: string;

  const contentType = req.headers.get("content-type")?.toLowerCase() ?? "";
  // Prefer JSON base64 from mobile — RN FormData multipart hangs and never aborts reliably.
  if (contentType.includes("application/json")) {
    let body: { base64?: string; contentType?: string };
    try {
      body = (await withTimeout(req.json(), FORM_MS, "message image json")) as {
        base64?: string;
        contentType?: string;
      };
    } catch (e) {
      console.error("[uploads/message-image] json body failed", e instanceof Error ? e.message : e);
      return NextResponse.json(
        { error: "Upload timed out while reading the photo. Try a smaller image." },
        { status: 504 },
      );
    }
    const rawBase64 = typeof body.base64 === "string" ? body.base64.trim() : "";
    const payload = rawBase64.includes(",") ? (rawBase64.split(",").pop() ?? "") : rawBase64;
    if (!payload) {
      return NextResponse.json({ error: "Missing base64 image payload." }, { status: 400 });
    }
    mime = (body.contentType?.trim() || "image/jpeg").toLowerCase();
    if (!ALLOWED.has(mime)) {
      return NextResponse.json(
        { error: "Missing file or invalid type. Use JPG, PNG, or WebP." },
        { status: 400 },
      );
    }
    try {
      buf = Buffer.from(payload, "base64");
    } catch {
      return NextResponse.json({ error: "Invalid base64 image payload." }, { status: 400 });
    }
  } else {
    let form: FormData;
    try {
      form = await withTimeout(req.formData(), FORM_MS, "message image formData");
    } catch (e) {
      console.error("[uploads/message-image] formData failed", e instanceof Error ? e.message : e);
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
    mime = file.mime;
    buf = Buffer.from(await file.blob.arrayBuffer());
  }

  if (buf.length > MAX_BYTES) {
    return NextResponse.json({ error: "Photo must be 8MB or smaller." }, { status: 400 });
  }

  if (!magicMatches(buf, mime)) {
    return NextResponse.json({ error: "File does not match its type." }, { status: 400 });
  }

  const ext = ALLOWED.get(mime)!;
  const objectName = `${randomUUID()}.${ext}`;

  const uploaded = await uploadMessageImageToSupabase(uid, objectName, buf, mime);
  if (!uploaded.ok) {
    return NextResponse.json({ error: uploaded.message }, { status: 502 });
  }

  return NextResponse.json({ url: uploaded.publicUrl });
}
