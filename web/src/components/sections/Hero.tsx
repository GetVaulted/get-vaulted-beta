import Link from "next/link";
import { HeroVisual } from "@/components/sections/HeroVisual";

const trust = [
  { label: "Secure checkout", icon: LockIcon },
  { label: "Ship-to-vault", icon: VaultIcon },
  { label: "Raw & graded inventory", icon: ShieldIcon },
  { label: "Verified sellers", icon: CheckIcon },
] as const;

type HeroProps = {
  liveMarketplaceEnabled?: boolean;
};

export function Hero({ liveMarketplaceEnabled = true }: HeroProps) {
  return (
    <section className="relative border-b border-white/[0.07] bg-[linear-gradient(180deg,rgba(14,14,18,0.95)_0%,#000000_100%)] after:pointer-events-none after:absolute after:inset-x-4 after:bottom-0 after:h-px after:bg-gradient-to-r after:from-transparent after:via-gold/30 after:to-transparent sm:after:inset-x-6 lg:after:inset-x-8">
      <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-90" aria-hidden>
        <div className="absolute -left-24 top-0 h-[280px] w-[280px] rounded-full bg-[radial-gradient(circle_at_center,rgba(201,162,39,0.14),transparent_70%)] blur-2xl" />
      </div>

      <div className="relative mx-auto w-full max-w-[1920px] px-3 pb-3 pt-3 sm:px-4 lg:px-10 lg:pb-4 lg:pt-4">
        <div className="grid gap-4 lg:min-h-[clamp(400px,40dvh,500px)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-stretch lg:gap-5">
          <div className="flex min-w-0 flex-col justify-center lg:min-h-0 lg:py-1">
            <p className="mb-2 inline-flex w-fit items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gold-bright shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
              {liveMarketplaceEnabled ? (
                <>
                  <span className="size-1.5 animate-pulse rounded-full bg-live shadow-[0_0_8px_rgba(220,38,38,0.75)]" />
                  Live now · shop · clips
                </>
              ) : (
                <>
                  <span className="size-1.5 rounded-full bg-gold-bright/80 shadow-[0_0_8px_rgba(201,162,39,0.45)]" />
                  Live breaks · opening soon
                </>
              )}
            </p>
            <h1>
              <span className="sr-only">Get Vaulted</span>
              {/* eslint-disable-next-line @next/next/no-img-element -- SVG wordmark scales cleanly without image optimization */}
              <img
                src="/brand/white-logo.svg"
                alt=""
                width={468}
                height={132}
                className="h-auto w-[min(82vw,22rem)] sm:w-[min(58vw,26rem)] lg:w-[min(32vw,30rem)]"
                draggable={false}
                aria-hidden
              />
            </h1>
            <p className="mt-5 max-w-xs text-xs leading-relaxed tracking-tight text-zinc-400 sm:max-w-sm sm:text-sm">
              Live spots, fixed-price slabs, and replayable hits—one place for collectors who want show
              energy with listing-grade clarity.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href="/marketplace"
                className="inline-flex h-9 items-center justify-center rounded-full bg-gradient-to-r from-gold to-gold-bright px-5 text-[11px] font-bold uppercase tracking-wide text-zinc-950 shadow-[0_0_28px_-6px_rgba(201,162,39,0.55)] transition-all duration-200 hover:brightness-110 hover:shadow-[0_0_36px_-4px_rgba(232,212,139,0.45)]"
              >
                Shop marketplace
              </Link>
              <Link
                href="/merch"
                className="inline-flex h-9 items-center justify-center rounded-full border border-white/15 bg-white/[0.04] px-5 text-[11px] font-bold uppercase tracking-wide text-zinc-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-all duration-200 hover:border-sky-400/35 hover:text-sky-100"
              >
                Merch
              </Link>
              <Link
                href={liveMarketplaceEnabled ? "/live" : "/coming-soon"}
                className="inline-flex h-9 items-center justify-center rounded-full border border-white/15 bg-white/[0.04] px-5 text-[11px] font-bold uppercase tracking-wide text-gold-bright shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-all duration-200 hover:border-gold/40 hover:bg-gold/10 hover:brightness-110"
              >
                {liveMarketplaceEnabled ? "Join a break" : "Live — coming soon"}
              </Link>
            </div>
            <ul className="mt-4 flex flex-wrap gap-1.5">
              {trust.map(({ label, icon: Icon }) => (
                <li
                  key={label}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-[#0c0c0f] px-2 py-1 text-[10px] font-medium text-zinc-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                >
                  <Icon className="size-3 shrink-0 text-gold-bright" aria-hidden />
                  {label}
                </li>
              ))}
            </ul>
          </div>

          <div className="min-h-[200px] lg:min-h-0 lg:h-full">
            <HeroVisual />
          </div>
        </div>
      </div>
    </section>
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

function VaultIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
    </svg>
  );
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
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
