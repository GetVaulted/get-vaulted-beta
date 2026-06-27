import { NextResponse } from "next/server";
import { resolveAccountUserId } from "@/lib/resolve-account-auth";
import { searchShippoAddressAutocomplete } from "@/lib/shippo-address-autocomplete";
import { isShippoConfigured } from "@/lib/shippo";

export async function GET(req: Request) {
  const auth = await resolveAccountUserId(req);
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const query = (url.searchParams.get("q") ?? url.searchParams.get("address") ?? "").trim();
  const country = (url.searchParams.get("country") ?? url.searchParams.get("country_code") ?? "US")
    .trim()
    .toUpperCase()
    .slice(0, 2);
  const container = (url.searchParams.get("container") ?? "").trim() || undefined;

  if (query.length < 3) {
    return NextResponse.json({ suggestions: [], enabled: isShippoConfigured() });
  }

  if (!isShippoConfigured()) {
    return NextResponse.json({
      suggestions: [],
      enabled: false,
      message: "Address autocomplete requires Shippo in this environment.",
    });
  }

  try {
    const suggestions = await searchShippoAddressAutocomplete({
      query,
      countryCode: country || "US",
      container,
    });
    return NextResponse.json({ suggestions, enabled: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[addresses/autocomplete]", msg);
    return NextResponse.json({ suggestions: [], enabled: true, error: msg.slice(0, 240) });
  }
}
