import { NextResponse } from "next/server";
import { getActivePlatformShippingProfiles } from "@/services/shipping/platform-shipping-profiles";

export async function GET() {
  try {
    const profiles = await getActivePlatformShippingProfiles();
    return NextResponse.json({ profiles });
  } catch {
    return NextResponse.json({ profiles: [] });
  }
}
