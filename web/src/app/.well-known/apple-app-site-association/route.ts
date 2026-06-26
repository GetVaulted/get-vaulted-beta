import { NextResponse } from "next/server";
import { appleAppSiteAssociationDocument } from "@/lib/universal-app-links";

export const dynamic = "force-static";

/** iOS Universal Links — must be served without redirects at /.well-known/apple-app-site-association */
export async function GET() {
  return NextResponse.json(appleAppSiteAssociationDocument(), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
