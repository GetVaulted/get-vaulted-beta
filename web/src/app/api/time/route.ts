import { NextResponse } from "next/server";

/** Lightweight clock ping for live UI skew calibration without loading full room payloads. */
export async function GET() {
  return NextResponse.json({ serverNowMs: Date.now() });
}
