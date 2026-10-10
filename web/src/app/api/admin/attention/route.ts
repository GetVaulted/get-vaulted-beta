import { NextResponse } from "next/server";
import { loadAttentionItems } from "@/lib/admin/admin-attention";
import { requireAdmin } from "@/lib/require-admin";

export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;
  const items = await loadAttentionItems();
  return NextResponse.json({ items, total: items.reduce((n, i) => n + i.count, 0) });
}
