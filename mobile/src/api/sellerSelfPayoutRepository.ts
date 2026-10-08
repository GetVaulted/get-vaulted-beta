/**
 * Seller "Initiate Payout" — mirrors web /api/account/seller/payout.
 */
import { fetchWebApiAuthed } from "../lib/fetchWebApiAuthed";

export type SellerSelfPayoutSummaryDTO = {
  state: "ready" | "nothing_ready" | "below_minimum" | "cooldown" | "blocked";
  canInitiate: boolean;
  message: string;
  blockedReason: string | null;
  readyOrderCount: number;
  readyUsd: number;
  availableUsd: number | null;
  payableUsd: number;
  waitingUsd?: number;
  payableOrderCount: number;
  minimumUsd: number;
  cooldownEndsAt: string | null;
};

export type SellerSelfPayoutResultDTO = { ok: boolean; message: string };

export async function fetchSellerSelfPayoutSummary(
  accessToken: string,
): Promise<SellerSelfPayoutSummaryDTO | null> {
  const res = await fetchWebApiAuthed("/api/account/seller/payout", accessToken, { method: "GET" });
  if (!res.ok) return null;
  return (await res.json()) as SellerSelfPayoutSummaryDTO;
}

export async function initiateSellerSelfPayout(accessToken: string): Promise<SellerSelfPayoutResultDTO> {
  try {
    const res = await fetchWebApiAuthed("/api/account/seller/payout", accessToken, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Payout creation talks to Stripe several times; allow longer than the default request timeout.
    }, { timeoutMs: 45_000 });
    const j = (await res.json().catch(() => null)) as { ok?: boolean; message?: string; error?: string } | null;
    return {
      ok: j?.ok === true,
      message: j?.message ?? j?.error ?? (res.ok ? "Payout started." : "We couldn't start your payout. Please try again."),
    };
  } catch {
    return { ok: false, message: "We couldn't reach the server. Check your connection and try again." };
  }
}
