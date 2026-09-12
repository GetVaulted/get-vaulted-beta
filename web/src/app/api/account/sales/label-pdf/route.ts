import { NextResponse } from "next/server";
import { resolveAccountUserId } from "@/lib/resolve-account-auth";
import { isAllowedShippoLabelUrl } from "@/lib/shippo-label-format";

export const runtime = "nodejs";

/** Same-origin proxy for Shippo label PDFs so thermal print pages can embed and print reliably. */
export async function GET(req: Request) {
  const auth = await resolveAccountUserId(req);
  if (auth instanceof NextResponse) return auth;

  const src = new URL(req.url).searchParams.get("src")?.trim();
  if (!src || !isAllowedShippoLabelUrl(src)) {
    return NextResponse.json({ error: "Invalid label URL." }, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(src);
  } catch (e) {
    console.error("[label-pdf] fetch failed", e);
    return NextResponse.json({ error: "Could not fetch label." }, { status: 502 });
  }

  if (!upstream.ok) {
    return NextResponse.json({ error: "Could not fetch label." }, { status: 502 });
  }

  const bytes = await upstream.arrayBuffer();
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "application/pdf",
      "Content-Disposition": "inline",
      "Cache-Control": "private, max-age=300",
    },
  });
}
