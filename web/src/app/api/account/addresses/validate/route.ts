import { NextResponse } from "next/server";
import { resolveAccountUserId } from "@/lib/resolve-account-auth";
import { validateAddressCreateInput, type AddressInput } from "@/lib/address-book";
import { verifyAddressForShipping } from "@/lib/shippo-address-validation";
import { isShippoConfigured } from "@/lib/shippo";

export async function POST(req: Request) {
  const auth = await resolveAccountUserId(req, { skipStripeSiblingSync: true });
  if (auth instanceof NextResponse) return auth;

  let body: AddressInput;
  try {
    body = (await req.json()) as AddressInput;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = validateAddressCreateInput(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  if (!isShippoConfigured()) {
    return NextResponse.json({
      valid: true,
      verified: false,
      skipped: true,
      message: "Address format looks complete. Carrier verification runs when Shippo is enabled.",
      suggested: {
        fullName: parsed.data.fullName,
        line1: parsed.data.line1,
        line2: parsed.data.line2,
        city: parsed.data.city,
        state: parsed.data.state,
        postalCode: parsed.data.postalCode,
        country: parsed.data.country,
      },
    });
  }

  const result = await verifyAddressForShipping({
    fullName: parsed.data.fullName,
    line1: parsed.data.line1,
    line2: parsed.data.line2,
    city: parsed.data.city,
    state: parsed.data.state,
    postalCode: parsed.data.postalCode,
    country: parsed.data.country,
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        valid: false,
        verified: false,
        error: result.error,
        messages: result.messages,
      },
      { status: 422 },
    );
  }

  return NextResponse.json({
    valid: true,
    verified: result.verified,
    corrected: result.corrected,
    messages: result.messages,
    suggested: result.fields,
  });
}
