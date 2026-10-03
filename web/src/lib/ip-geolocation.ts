/**
 * Best-effort IP -> approximate location, using ipapi.co's free/keyless
 * endpoint. City-level accuracy at best, and it's the ISP's location, not a
 * GPS pin - good enough for "which city/region is this account on," not for
 * anything more precise.
 *
 * Never throws: a failed or slow lookup just means the location columns
 * stay null, and the IP itself is still recorded either way.
 */

const LOOKUP_TIMEOUT_MS = 3_000;

export type IpLocation = {
  city: string | null;
  region: string | null;
  country: string | null;
  countryCode: string | null;
  lat: number | null;
  lon: number | null;
};

const EMPTY_LOCATION: IpLocation = {
  city: null,
  region: null,
  country: null,
  countryCode: null,
  lat: null,
  lon: null,
};

/** Private/loopback/link-local ranges never resolve to a real location - skip the call entirely. */
export function isPrivateOrLocalIp(ip: string): boolean {
  if (ip === "::1" || ip === "127.0.0.1") return true;
  if (ip.startsWith("10.") || ip.startsWith("192.168.") || ip.startsWith("169.254.")) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)) return true;
  if (ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80:")) return true;
  return false;
}

export async function resolveIpLocation(ip: string): Promise<IpLocation> {
  if (isPrivateOrLocalIp(ip)) return EMPTY_LOCATION;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);

  try {
    const res = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, {
      signal: controller.signal,
      headers: { "User-Agent": "GetVaulted-server/1.0" },
    });
    if (!res.ok) return EMPTY_LOCATION;

    const data = (await res.json()) as Record<string, unknown>;
    if (typeof data.error !== "undefined" && data.error) return EMPTY_LOCATION;

    return {
      city: typeof data.city === "string" ? data.city : null,
      region: typeof data.region === "string" ? data.region : null,
      country: typeof data.country_name === "string" ? data.country_name : null,
      countryCode: typeof data.country_code === "string" ? data.country_code : null,
      lat: typeof data.latitude === "number" ? data.latitude : null,
      lon: typeof data.longitude === "number" ? data.longitude : null,
    };
  } catch (err) {
    console.error("[ip-geolocation] lookup failed", err);
    return EMPTY_LOCATION;
  } finally {
    clearTimeout(timer);
  }
}
