import { NextResponse } from "next/server";
import { listAdminChatMessages } from "@/lib/admin/admin-content-moderation";
import { requireAdmin } from "@/lib/require-admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;
  const sp = new URL(request.url).searchParams;
  const messages = await listAdminChatMessages({
    showId: sp.get("show") ?? undefined,
    username: sp.get("user") ?? undefined,
    q: sp.get("q") ?? undefined,
  });
  return NextResponse.json({ messages });
}
