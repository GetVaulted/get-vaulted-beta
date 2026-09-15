/**
 * Mobile seller payout preference — mirrors web /api/account/seller/payout-preference.
 */
import { fetchWebApiAuthed } from "../lib/fetchWebApiAuthed";

export type SellerPayoutPreferenceDTO = {
  paypalSellerPayoutsEnabled: boolean;
  preferredSellerPayoutProcessor: "STRIPE" | "PAYPAL";
  paypalPayoutEmail: string | null;
  paypalPayoutVerifiedAt: string | null;
  stripeOnboardingComplete: boolean;
};

export async function fetchSellerPayoutPreference(
  accessToken: string,
): Promise<SellerPayoutPreferenceDTO | null> {
  const res = await fetchWebApiAuthed("/api/account/seller/payout-preference", accessToken, {
    method: "GET",
  });
  if (!res.ok) return null;
  return (await res.json()) as SellerPayoutPreferenceDTO;
}

export async function updateSellerPayoutPreference(
  accessToken: string,
  body: {
    preferredSellerPayoutProcessor?: "STRIPE" | "PAYPAL";
    paypalPayoutEmail?: string | null;
    verifyPayPalEmail?: boolean;
  },
): Promise<{ ok: true; data: SellerPayoutPreferenceDTO } | { ok: false; error: string }> {
  const res = await fetchWebApiAuthed("/api/account/seller/payout-preference", accessToken, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = (await res.json().catch(() => ({}))) as SellerPayoutPreferenceDTO & { error?: string };
  if (!res.ok) return { ok: false, error: j.error ?? "Could not save payout preference." };
  return { ok: true, data: j };
}
