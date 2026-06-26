import { NextResponse } from "next/server";
import { androidAppLinkSha256FingerprintsFromEnv, androidAssetLinksDocument } from "@/lib/universal-app-links";

export const dynamic = "force-static";

/** Android App Links — requires ANDROID_APP_LINK_SHA256 on the deploy host. */
export async function GET() {
  const fingerprints = androidAppLinkSha256FingerprintsFromEnv();
  return NextResponse.json(androidAssetLinksDocument(fingerprints), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
