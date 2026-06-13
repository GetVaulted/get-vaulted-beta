const TRUST_ITEMS = [
  { label: "Protected checkout", icon: LockIcon },
  { label: "Verified sellers", icon: ShieldIcon },
  { label: "Authenticated listings", icon: CheckIcon },
  { label: "Tracking on every order", icon: TruckIcon },
] as const;

type MarketplaceTrustStripProps = {
  variant?: "hero" | "inline" | "band";
};

export function MarketplaceTrustStrip({ variant = "inline" }: MarketplaceTrustStripProps) {
  if (variant === "band") {
    return (
      <div
        className="border-y border-white/[0.06] bg-[linear-gradient(90deg,rgba(201,162,39,0.04)_0%,rgba(255,255,255,0.02)_50%,rgba(201,162,39,0.04)_100%)]"
        role="list"
        aria-label="Marketplace confidence"
      >
        <div className="mx-auto flex max-w-[1920px] flex-wrap items-center justify-center gap-x-5 gap-y-1.5 px-3 py-2 sm:px-4 lg:px-10">
          {TRUST_ITEMS.map(({ label, icon: Icon }) => (
            <span
              key={label}
              role="listitem"
              className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-300 sm:text-[11px]"
            >
              <span className="inline-flex size-6 items-center justify-center rounded-full border border-gold/25 bg-gold/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                <Icon className="size-3 text-gold-bright" aria-hidden />
              </span>
              {label}
            </span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <ul
      className={
        variant === "hero"
          ? "mt-5 flex flex-wrap gap-2"
          : "flex flex-wrap items-center gap-x-4 gap-y-2"
      }
      aria-label="Marketplace confidence"
    >
      {TRUST_ITEMS.map(({ label, icon: Icon }) => (
        <li
          key={label}
          className={
            variant === "hero"
              ? "inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-[#0c0c0f]/80 px-2.5 py-1 text-[10px] font-medium text-zinc-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-sm"
              : "inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400 sm:text-[11px]"
          }
        >
          <Icon className="size-3 shrink-0 text-gold-bright" aria-hidden />
          {label}
        </li>
      ))}
    </ul>
  );
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
      />
    </svg>
  );
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
      />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function TruckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10m10 0h4m-4 0a2 2 0 11-4 0m4 0v-4m0 4H9m6-8h3l2 2v4m-6-4V6"
      />
    </svg>
  );
}
