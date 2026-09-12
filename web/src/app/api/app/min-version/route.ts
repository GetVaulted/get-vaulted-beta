import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Public, unauthenticated — the mobile app calls this before a user is signed in (or even past
 * the launch screen), so it must never depend on auth.
 *
 * iOS `buildNumber` and Android `versionCode` are kept equal on every release (see
 * mobile/RELEASE.md's `release:version` script), so a single integer "minimum build" per
 * platform is enough to gate on — no separate semver comparison needed.
 *
 * To force everyone below a given build to update: set MIN_APP_BUILD_IOS and/or
 * MIN_APP_BUILD_ANDROID in Netlify env vars to that build number and redeploy. Defaults to "0"
 * (no minimum — nobody is blocked) so this is opt-in per release, not something that needs to be
 * bumped on every ship.
 */
function readMinBuild(envVar: string | undefined): number {
  const n = Number(envVar?.trim());
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export async function GET() {
  return NextResponse.json(
    {
      ios: { minBuildNumber: readMinBuild(process.env.MIN_APP_BUILD_IOS) },
      android: { minBuildNumber: readMinBuild(process.env.MIN_APP_BUILD_ANDROID) },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
