"use client";

import { VAULTED_SECURE_CHECKOUT } from "@/lib/vaulted-secure-checkout-copy";

function formatMoneyFromCents(cents: number) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

/**
 * Optional high-value checkout panel (copy from `vaulted-secure-checkout-copy`; only when escrow features are enabled).
 */
export function VaultedSecureCheckoutPanel({
  copy = VAULTED_SECURE_CHECKOUT,
  feeCents,
}: {
  copy?: typeof VAULTED_SECURE_CHECKOUT;
  feeCents: number;
}) {
  return (
    <div className="rounded-2xl border border-sky-500/25 bg-sky-950/20 p-5 sm:p-6">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-sky-200/90">{copy.title}</p>
      <p className="mt-3 text-sm leading-relaxed text-zinc-200">{copy.description}</p>
      <p className="mt-3 text-xs text-zinc-400">{copy.shortDescription}</p>
      <dl className="mt-4 flex justify-between gap-4 border-t border-white/[0.06] pt-3 text-sm">
        <dt className="text-zinc-500">{copy.feeLabel} (est.)</dt>
        <dd className="font-mono font-semibold text-sky-100">{formatMoneyFromCents(feeCents)}</dd>
      </dl>
    </div>
  );
}
