import { NextResponse } from "next/server";
import { listDisputes } from "@/lib/admin/admin-disputes";
import { requireAdmin } from "@/lib/require-admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;
  return NextResponse.json({ disputes: await listDisputes() });
}
