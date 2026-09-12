import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";

/** Lightweight admin probe for mobile Ops gate (Bearer or cookie). */
export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;
  return NextResponse.json({ isAdmin: true, userId: gate.userId });
}
