import { NextResponse } from "next/server";
import { resolveAccountSellerUserId } from "@/lib/resolve-account-seller-user";
import {
  CURRENT_SELLER_TERMS_VERSION,
  recordSellerLiveTermsAcceptance,
  sellerLiveTermsRequired,
} from "@/lib/seller-live-terms";

/** GET — does this seller still need to accept the current live-content terms (Terms §7.1)? */
export async function GET(req: Request) {
  const resolved = await resolveAccountSellerUserId(req);
  if (resolved instanceof NextResponse) return resolved;
  const required = await sellerLiveTermsRequired(resolved.userId);
  return NextResponse.json({ required, version: CURRENT_SELLER_TERMS_VERSION });
}

/** POST — record that the seller accepted the current live-content terms. */
export async function POST(req: Request) {
  const resolved = await resolveAccountSellerUserId(req);
  if (resolved instanceof NextResponse) return resolved;

  let accepted = false;
  try {
    const body = (await req.json()) as { accepted?: boolean };
    accepted = body.accepted === true;
  } catch {
    /* fall through */
  }
  if (!accepted) {
    return NextResponse.json({ error: "You must accept the terms to continue." }, { status: 400 });
  }

  const saved = await recordSellerLiveTermsAcceptance(resolved.userId);
  return NextResponse.json({
    required: false,
    version: saved.sellerTermsVersion,
    acceptedAt: saved.sellerTermsAcceptedAt?.toISOString() ?? null,
  });
}
