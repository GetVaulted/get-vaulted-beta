import { NextResponse } from "next/server";
import {
  isLiveMarketplaceBlocked,
  isLiveMarketplaceBetaDeploy,
  isLiveMarketplacePubliclyAvailable,
} from "@/lib/live-coming-soon";

/**
 * Lightweight probe for mobile QA — confirms the request reached Next.js (not an edge 403)
 * and reports live-gate env without touching Prisma.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  return NextResponse.json(
    {
      ok: true,
      host: url.host,
      client: req.headers.get("x-gv-client"),
      userAgent: req.headers.get("user-agent"),
      livePublic: isLiveMarketplacePubliclyAvailable(),
      liveBlocked: isLiveMarketplaceBlocked(),
      betaDeploy: isLiveMarketplaceBetaDeploy(),
      publicLiveRoomsGetAllowed: true,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
