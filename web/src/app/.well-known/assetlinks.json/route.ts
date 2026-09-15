import { NextResponse } from "next/server";
import { androidAppLinkSha256FingerprintsFromEnv, androidAssetLinksDocument } from "@/lib/universal-app-links";

/** Read env at request time — force-static was baking empty fingerprints and failing some deploys. */
export const dynamic = "force-dynamic";

/** Android App Links — set ANDROID_APP_LINK_SHA256 (Play App Signing cert) on Netlify. */
export async function GET() {
  try {
    const fingerprints = androidAppLinkSha256FingerprintsFromEnv();
    const body = androidAssetLinksDocument(fingerprints);
    return NextResponse.json(body, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (e) {
    console.error("[assetlinks.json]", e instanceof Error ? e.message : e);
    return NextResponse.json([], {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  }
}
