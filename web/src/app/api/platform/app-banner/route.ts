import { NextResponse } from "next/server";
import { getPublicAppBanner } from "@/lib/platform-app-banner";

export const runtime = "nodejs";

/** Public home promo banner for mobile/web — no auth. Returns `{ banner: null }` when off. */
export async function GET() {
  const banner = await getPublicAppBanner(true);
  return NextResponse.json(
    { banner },
    {
      headers: {
        "Cache-Control": "public, max-age=30, stale-while-revalidate=60",
      },
    },
  );
}
