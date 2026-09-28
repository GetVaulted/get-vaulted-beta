import { NextResponse } from "next/server";
import { resolveIpLocation } from "@/lib/ip-geolocation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";

/**
 * One-off admin action: resolve city/region/country for UserIpLog rows that
 * were captured before geolocation was wired in (city is still null), so
 * historical rows aren't stuck without a location forever.
 *
 * Looks up each *distinct* IP once (not once per row) and updates every row
 * with that IP, since the same IP can appear across multiple rows/users.
 *
 * GET or POST /api/admin/trust/user-ip-log/backfill-geo
 * (both supported so it can be triggered by pasting the URL in a browser
 * while signed in as an admin, not just from a script.)
 */
async function runBackfill() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const rows = await prisma.userIpLog.findMany({
    where: { city: null },
    select: { ipAddress: true },
    distinct: ["ipAddress"],
  });
  const ips = rows.map((r) => r.ipAddress);

  let updated = 0;
  let resolved = 0;
  const failures: string[] = [];

  for (const ip of ips) {
    const location = await resolveIpLocation(ip);
    if (!location.city && !location.country) {
      failures.push(ip);
      continue;
    }
    resolved += 1;
    const result = await prisma.userIpLog.updateMany({
      where: { ipAddress: ip, city: null },
      data: {
        city: location.city,
        region: location.region,
        country: location.country,
        countryCode: location.countryCode,
        lat: location.lat,
        lon: location.lon,
      },
    });
    updated += result.count;
    // Be polite to the free geolocation endpoint's rate limit.
    await new Promise((r) => setTimeout(r, 300));
  }

  return NextResponse.json({
    distinctIpsChecked: ips.length,
    distinctIpsResolved: resolved,
    rowsUpdated: updated,
    unresolvedIps: failures,
  });
}

export const GET = runBackfill;
export const POST = runBackfill;
