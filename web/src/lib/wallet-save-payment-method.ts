export function paymentMethodIdFromSetupIntent(
  setupIntent: { payment_method?: string | { id?: string } | null } | null | undefined,
): string | null {
  if (!setupIntent) return null;
  const pm = setupIntent.payment_method;
  if (typeof pm === "string" && pm.startsWith("pm_")) return pm;
  if (pm && typeof pm === "object" && typeof pm.id === "string" && pm.id.startsWith("pm_")) return pm.id;
  return null;
}

export type SavedPaymentMethodRow = {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
};

export async function finalizeSavedPaymentMethod(args: {
  paymentMethodId?: string | null;
  setupIntentId?: string | null;
  clientSecret?: string | null;
}): Promise<{ ok: true; paymentMethod: SavedPaymentMethodRow } | { ok: false; error: string }> {
  const body: Record<string, string> = {};
  if (args.paymentMethodId?.startsWith("pm_")) body.paymentMethodId = args.paymentMethodId;
  if (args.setupIntentId?.startsWith("seti_")) body.setupIntentId = args.setupIntentId;
  if (args.clientSecret?.includes("_secret_")) body.clientSecret = args.clientSecret;
  if (!body.paymentMethodId && !body.setupIntentId && !body.clientSecret) {
    return { ok: false, error: "Card save did not return a payment method. Try again." };
  }
  const res = await fetch("/api/account/payment-methods/finalize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  const j = (await res.json().catch(() => ({}))) as {
    error?: string;
    paymentMethodId?: string;
    expMonth?: number;
    expYear?: number;
    brand?: string;
    last4?: string;
  };
  if (!res.ok) {
    return { ok: false, error: typeof j.error === "string" ? j.error : "Could not save payment method." };
  }
  if (!j.paymentMethodId?.startsWith("pm_")) {
    return { ok: false, error: "Card save did not return a payment method. Try again." };
  }
  return {
    ok: true,
    paymentMethod: {
      id: j.paymentMethodId,
      expMonth: typeof j.expMonth === "number" ? j.expMonth : 0,
      expYear: typeof j.expYear === "number" ? j.expYear : 0,
      brand: typeof j.brand === "string" && j.brand.trim() ? j.brand : "Card",
      last4: typeof j.last4 === "string" && j.last4.trim() ? j.last4 : "0000",
    },
  };
}
