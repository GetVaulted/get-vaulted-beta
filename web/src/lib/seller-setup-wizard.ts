import { isPayoutSetupComplete, type SellerReadinessChecks } from "@/lib/seller-setup-state";

export const SELLER_WIZARD_TOTAL_STEPS = 5;
export const SELLER_WIZARD_COMPLETE_KEY = "gv_seller_wizard_complete";
export const SELLER_WIZARD_COMPLETE_EVENT = "gv-seller-wizard-complete";

export type SellerWizardStep = 1 | 2 | 3 | 4 | 5;

export function resolveSellerWizardStep(input: {
  checks: SellerReadinessChecks | null | undefined;
  wizardComplete: boolean;
}): SellerWizardStep {
  const checks = input.checks;
  const payoutsDone = isPayoutSetupComplete(checks);
  const shippingDone = Boolean(checks?.hasShipFromAddress);
  const started = Boolean(checks?.hasStripeAccount || checks?.hasShipFromAddress);

  if (!started && !payoutsDone) return 1;
  if (!payoutsDone) return 2;
  if (!shippingDone) return 3;
  if (!input.wizardComplete) return 4;
  return 5;
}

export function readSellerWizardComplete(): boolean {
  if (typeof window === "undefined") return false;
  return window.sessionStorage.getItem(SELLER_WIZARD_COMPLETE_KEY) === "1";
}

export function markSellerWizardComplete(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(SELLER_WIZARD_COMPLETE_KEY, "1");
  window.dispatchEvent(new Event(SELLER_WIZARD_COMPLETE_EVENT));
}

export type PersistSellerWizardCompleteResult = { ok: true } | { ok: false; error: string };

/** Session flag + server persistence for cross-platform HQ unlock. */
export async function persistSellerWizardComplete(
  sellerAgreementAccepted: boolean,
): Promise<PersistSellerWizardCompleteResult> {
  try {
    const res = await fetch("/api/account/seller/wizard-complete", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sellerAgreementAccepted }),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      return { ok: false, error: body.error ?? "Could not save seller setup completion." };
    }
    markSellerWizardComplete();
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not reach the server. Check your connection and try again." };
  }
}

export function clearSellerWizardComplete(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(SELLER_WIZARD_COMPLETE_KEY);
  window.dispatchEvent(new Event(SELLER_WIZARD_COMPLETE_EVENT));
}
