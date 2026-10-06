import { NextResponse } from "next/server";
import { getServerSessionSafe } from "@/lib/auth";
import { requestHasSupabaseBearer } from "@/lib/mobile-supabase-bearer";
import { prisma } from "@/lib/prisma";
import { requireUserIdFromSupabaseBearer } from "@/lib/require-supabase-bearer";

export type RequireAdminResult =
  | { ok: true; userId: string }
  | { ok: false; response: NextResponse };

async function tryRequestFromNextHeaders(): Promise<Request | null> {
  try {
    const { headers } = await import("next/headers");
    const h = await headers();
    return new Request("http://localhost/api/admin", { headers: h });
  } catch {
    return null;
  }
}

async function requireAdminFromBearer(request: Request): Promise<RequireAdminResult> {
  const auth = await requireUserIdFromSupabaseBearer(request, { skipStripeSiblingSync: true });
  if (auth instanceof NextResponse) {
    return { ok: false, response: auth };
  }

  const row = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { role: true, suspendedAt: true },
  });
  // Bearer path already rejects suspended accounts; role check is the admin gate.
  if (row?.role !== "admin" || row.suspendedAt) {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { ok: true, userId: auth.userId };
}

/**
 * Platform admin gate for `/api/admin/*`.
 * Accepts NextAuth cookie sessions (web) or mobile Supabase Bearer (`Authorization` /
 * `X-GV-Supabase-Auth`). When `request` is omitted, reads the incoming request headers
 * so existing `requireAdmin()` call sites work for mobile without per-route updates.
 */
export async function requireAdmin(request?: Request): Promise<RequireAdminResult> {
  const req = request ?? (await tryRequestFromNextHeaders());
  if (req && requestHasSupabaseBearer(req)) {
    return requireAdminFromBearer(req);
  }

  const session = await getServerSessionSafe();
  if (!session?.user?.id) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const row = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, suspendedAt: true },
  });
  if (row?.role !== "admin" || row.suspendedAt) {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { ok: true, userId: session.user.id };
}
