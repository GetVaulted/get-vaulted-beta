import { NextResponse } from "next/server";
import { listLinkedAccountClusters } from "@/lib/admin/admin-linked-accounts";
import { requireAdmin } from "@/lib/require-admin";

export async function GET(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const limitRaw = Number(url.searchParams.get("limit") ?? "40");
  const payload = await listLinkedAccountClusters({
    limit: Number.isFinite(limitRaw) ? limitRaw : 40,
  });
  return NextResponse.json(payload);
}
