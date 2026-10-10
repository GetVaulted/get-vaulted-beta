import { NextResponse } from "next/server";
import { addAdminNote, listAdminNotes, SupportToolError } from "@/lib/admin/admin-support";
import { requireAdmin } from "@/lib/require-admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;
  const sp = new URL(request.url).searchParams;
  const type = sp.get("type") ?? "";
  const id = sp.get("id") ?? "";
  if (!type || !id) return NextResponse.json({ error: "type and id required" }, { status: 400 });
  return NextResponse.json({ notes: await listAdminNotes(type, id) });
}

export async function POST(request: Request) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;
  let body: { type?: string; id?: string; body?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  try {
    const result = await addAdminNote({
      adminUserId: gate.userId,
      targetType: body.type ?? "",
      targetId: body.id ?? "",
      body: body.body ?? "",
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof SupportToolError) return NextResponse.json({ error: e.code }, { status: e.status });
    console.error("[admin notes POST]", e);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
