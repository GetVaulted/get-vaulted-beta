const TRUST_ITEMS = [
  "Protected checkout",
  "Secure payment",
  "Verified seller",
  "Tracking provided after shipment",
] as const;

export function CheckoutTrustStrip({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={
        compact
          ? "grid grid-cols-2 gap-x-3 gap-y-2"
          : "flex flex-wrap items-center gap-x-4 gap-y-2"
      }
      role="list"
      aria-label="Purchase confidence"
    >
      {TRUST_ITEMS.map((label) => (
        <span
          key={label}
          role="listitem"
          className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400 sm:text-[11px]"
        >
          <svg className="size-3 shrink-0 text-gold-bright" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path
              d="M3 8.5l3 3 7-7.5"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {label}
        </span>
      ))}
    </div>
  );
}

const SALES_TAX_NOTE = "Sales tax is calculated securely at checkout when required.";
const PAYMENT_NOTE =
  "Payment is processed securely through Stripe. Your order is confirmed only after payment succeeds.";

export { SALES_TAX_NOTE, PAYMENT_NOTE };
