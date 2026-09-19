import { NextResponse } from "next/server";
import {
  getPlatformAppBannerAdmin,
  parseAppBannerUpdate,
  updatePlatformAppBanner,
} from "@/lib/platform-app-banner";
import { requireAdmin } from "@/lib/require-admin";

export const runtime = "nodejs";

export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;
  const banner = await getPlatformAppBannerAdmin(true);
  return NextResponse.json({ banner });
}

export async function PATCH(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = parseAppBannerUpdate(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const banner = await updatePlatformAppBanner(parsed.data, gate.userId);
    return NextResponse.json({ ok: true, banner });
  } catch (e) {
    console.error("[admin app-banner] update failed", e);
    return NextResponse.json({ error: "Could not save banner." }, { status: 500 });
  }
}
