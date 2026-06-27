import { NextResponse } from "next/server";
import { resolveAccountUserId } from "@/lib/resolve-account-auth";
import { resolveShippoAutocompleteAddress } from "@/lib/shippo-address-autocomplete";
import { isShippoConfigured } from "@/lib/shippo";

export async function GET(req: Request) {
  const auth = await resolveAccountUserId(req);
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const id = (url.searchParams.get("id") ?? "").trim();
  if (!id) {
    return NextResponse.json({ error: "Missing suggestion id." }, { status: 400 });
  }

  if (!isShippoConfigured()) {
    return NextResponse.json({ error: "Address autocomplete is not configured." }, { status: 503 });
  }

  try {
    const address = await resolveShippoAutocompleteAddress(id);
    if (!address) {
      return NextResponse.json({ error: "Could not resolve that address." }, { status: 404 });
    }
    return NextResponse.json({ address });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[addresses/autocomplete/retrieve]", msg);
    return NextResponse.json({ error: msg.slice(0, 240) }, { status: 502 });
  }
}
