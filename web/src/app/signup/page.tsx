import Link from "next/link";
import type { Metadata } from "next";
import { Suspense } from "react";
import { SignupForm } from "@/components/auth/SignupForm";
import { NOINDEX_METADATA } from "@/lib/site-seo";

export const metadata: Metadata = {
  title: "Join Get Vaulted — Create your account",
  description:
    "Own the moment — live breaks, auctions, and hits happening now. Join Get Vaulted in under 30 seconds.",
  ...NOINDEX_METADATA,
};

const valueCards = [
  {
    title: "Get in on live breaks before they fill",
    body: "Lock a spot, watch the rip, and walk away with the hit — not the FOMO.",
  },
  {
    title: "Win auctions as they happen",
    body: "Bid with clarity while lots close in real time, so the grail goes to you — not the tab you forgot.",
  },
  {
    title: "Buy graded grails with confidence",
    body: "Shop from verified sellers and vault-ready listings without second-guessing authenticity.",
  },
] as const;

const trustItems = [
  "Verified sellers",
  "Secure checkout",
  "Live auctions & breaks",
  "Real-time bidding",
] as const;

export default function SignupPage() {
  return (
    <main className="relative flex min-h-0 flex-1 flex-col">
      {/* Hero + signup form — two columns on lg, stacked on mobile */}
      <section
        className="relative box-border flex flex-col overflow-hidden border-b border-white/[0.06] bg-[linear-gradient(180deg,rgba(14,14,18,0.98)_0%,#030303_55%,#030303_100%)] md:min-h-[calc(100svh-3.5rem-1px)]"
        aria-labelledby="join-hero-title"
      >
        <div
          className="pointer-events-none absolute -right-24 top-0 h-[320px] w-[320px] rounded-full bg-[radial-gradient(circle_at_center,rgba(201,162,39,0.12),transparent_68%)] blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -left-32 bottom-0 h-[280px] w-[280px] rounded-full bg-[radial-gradient(circle_at_center,rgba(232,212,139,0.06),transparent_70%)] blur-3xl"
          aria-hidden
        />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold/25 to-transparent" aria-hidden />

        <div className="relative mx-auto flex min-h-0 w-full max-w-[1920px] flex-1 flex-col gap-6 px-4 pb-5 pt-2 sm:px-6 sm:pb-6 sm:pt-3 md:grid md:grid-cols-[minmax(0,1fr)_minmax(248px,340px)] md:grid-rows-[minmax(0,1fr)] md:items-stretch md:gap-x-8 md:gap-y-0 md:pb-4 md:pt-2 lg:grid-cols-[minmax(0,1fr)_minmax(252px,380px)] lg:gap-x-10 xl:gap-x-12">
          {/* Left: back link + messaging + CTAs + trust — vertically centered in row on md+ */}
          <div className="flex min-h-0 flex-col justify-center text-center md:h-full md:min-h-0 md:text-left lg:min-h-0">
            <Link
              href="/"
              className="inline-flex justify-center text-[11px] font-semibold uppercase tracking-wider text-gold-bright/90 transition hover:text-gold-bright md:justify-start"
            >
              ← Back to home
            </Link>
            <div className="mx-auto mt-7 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 md:mx-0 md:justify-start">
              <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                <span className="size-1.5 rounded-full bg-gold-bright/80 shadow-[0_0_10px_rgba(232,212,139,0.45)]" aria-hidden />
                New member access
              </p>
              <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                <span className="size-1.5 shrink-0 rounded-full bg-live shadow-[0_0_6px_rgba(220,38,38,0.45)]" aria-hidden />
                Live now
              </p>
            </div>
            <h1
              id="join-hero-title"
              className="font-display mt-3 text-[clamp(2rem,4.5vw,2.75rem)] font-black leading-[0.95] tracking-[-0.03em] text-foreground md:mt-3 xl:text-[clamp(2.125rem,4vw,3rem)]"
            >
              Join <span className="text-gold-bright">Get Vaulted</span>
            </h1>
            <p className="mx-auto mt-2 max-w-lg text-sm font-medium leading-relaxed text-zinc-300 sm:text-base md:mx-0">
              Own the moment — live breaks, auctions, and hits happening now
            </p>
            <div className="mt-3 flex flex-col items-stretch justify-center gap-2.5 sm:flex-row sm:justify-center md:justify-start">
              <Link
                href="#signup-form"
                className="inline-flex h-11 items-center justify-center rounded-full bg-gradient-to-r from-gold to-gold-bright px-8 text-sm font-bold text-zinc-950 shadow-[0_0_32px_-6px_rgba(201,162,39,0.55)] transition-all duration-200 hover:brightness-110 hover:shadow-[0_0_40px_-4px_rgba(232,212,139,0.45)] active:scale-[0.98]"
              >
                Create Account
              </Link>
              <Link
                href="/marketplace"
                className="inline-flex h-11 items-center justify-center rounded-full border border-white/[0.12] bg-transparent px-8 text-sm font-medium text-zinc-500 transition hover:border-white/20 hover:text-zinc-300"
              >
                Explore Marketplace
              </Link>
            </div>
            <p className="mx-auto mt-2 max-w-xl text-[11px] font-medium leading-relaxed text-zinc-400 sm:text-xs md:mx-0">
              Join in seconds <span className="text-zinc-600">·</span> No fees to browse{" "}
              <span className="text-zinc-600">·</span> Start bidding instantly
            </p>
            <div className="mx-auto mt-2 grid max-w-md grid-cols-2 gap-x-4 gap-y-1.5 text-left sm:max-w-lg md:mx-0">
              {trustItems.map((label) => (
                <div
                  key={label}
                  className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-wide text-zinc-500 sm:text-[10px] sm:tracking-wider"
                >
                  <span className="size-1 shrink-0 rounded-full bg-gold/60" aria-hidden />
                  {label}
                </div>
              ))}
            </div>
          </div>

          {/* Right: form */}
          <div
            id="signup-form"
            className="scroll-mt-24 md:flex md:h-full md:min-h-0 md:scroll-mt-28 md:flex-col md:justify-start"
            aria-labelledby="signup-form-title"
          >
            <div className="mx-auto w-full max-w-[25rem] rounded-2xl border border-white/[0.08] bg-[#0a0a0d] p-5 pb-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_24px_56px_-28px_rgba(0,0,0,0.85)] sm:max-w-[23.5rem] sm:p-5 md:mx-0 md:max-w-[22.5rem]">
              <h2
                id="signup-form-title"
                className="font-display text-center text-xl font-bold leading-tight text-foreground sm:text-2xl md:text-left"
              >
                Create your account
              </h2>
              <p className="mt-1.5 text-center text-sm text-zinc-500 md:text-left">
                Sign up takes less than 30 seconds. <span className="text-zinc-600">No spam.</span>
              </p>

              <Suspense
                fallback={<p className="mt-5 text-center text-sm text-zinc-500">Loading form…</p>}
              >
                <SignupForm />
              </Suspense>
            </div>
          </div>
        </div>
      </section>

      {/* Value cards */}
      <section className="border-b border-white/[0.05] py-14 sm:py-16" aria-labelledby="join-value-title">
        <div className="mx-auto w-full max-w-[1920px] px-4 sm:px-6 lg:px-10">
          <h2 id="join-value-title" className="sr-only">
            What you get
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5">
            {valueCards.map((card) => (
              <div
                key={card.title}
                className="flex flex-col rounded-2xl border border-white/[0.08] bg-[#0a0a0d] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_20px_50px_-28px_rgba(0,0,0,0.85)] transition hover:border-gold/20"
              >
                <p className="text-sm font-bold text-foreground">{card.title}</p>
                <p className="mt-2 text-[13px] leading-relaxed text-zinc-500">{card.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Account types */}
      <section className="py-14 sm:py-16" aria-labelledby="join-account-types">
        <div className="mx-auto w-full max-w-[1920px] px-4 sm:px-6 lg:px-10">
          <h2 id="join-account-types" className="sr-only">
            Choose how you use Get Vaulted
          </h2>
          <div className="grid gap-5 md:grid-cols-2 md:gap-6">
            <div className="flex flex-col rounded-2xl border border-gold/20 bg-[linear-gradient(165deg,rgba(201,162,39,0.08)_0%,#0c0c10_45%)] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] sm:p-7">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gold-bright/90">For collectors</p>
              <h3 className="font-display mt-2 text-xl font-bold text-foreground">Collector</h3>
              <p className="mt-3 text-sm leading-relaxed text-zinc-500">
                Buy, bid, join breaks, save hits — built for people who collect first.
              </p>
              <Link
                href="#signup-form"
                className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-full bg-gold text-sm font-semibold text-background transition hover:brightness-110 sm:mt-auto"
              >
                Join as Collector
              </Link>
            </div>
            <div className="flex flex-col rounded-2xl border border-white/[0.1] bg-[#0a0a0d] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:p-7">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">For hosts & shops</p>
              <h3 className="font-display mt-2 text-xl font-bold text-foreground">Seller / Breaker</h3>
              <p className="mt-3 text-sm leading-relaxed text-zinc-500">
                Create a seller account to host live shows, list inventory, run breaks, and build your collector audience.
              </p>
              <Link
                href="#signup-form"
                className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-full border border-gold/35 bg-gold/10 text-sm font-semibold text-gold-bright transition hover:border-gold/50 hover:bg-gold/15 sm:mt-auto"
              >
                Sign Up to Sell
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer reassurance */}
      <section className="border-t border-white/[0.06] py-10 sm:py-12" aria-label="Reassurance">
        <p className="mx-auto max-w-lg px-4 text-center text-[13px] leading-relaxed text-zinc-500 sm:px-6">
          No spam. Secure checkout. Built for collectors.
        </p>
      </section>
    </main>
  );
}
