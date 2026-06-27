import Link from "next/link";
import type { Metadata } from "next";
import { HelpCenterBrowse } from "@/components/help/HelpCenterBrowse";
import { CANONICAL_SHARE_SITE_FALLBACK } from "@/lib/live-room-share-metadata";

const SUPPORT_EMAIL = "support@shopgetvaulted.com";
const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}?subject=Get%20Vaulted%20Support%20Request`;

export const metadata: Metadata = {
  title: "Help Center · Get Vaulted Support",
  description:
    "Step-by-step guides for buying, selling, live shows, shipping, payments, trades, disputes, and account settings on Get Vaulted.",
  alternates: {
    canonical: `${CANONICAL_SHARE_SITE_FALLBACK}/support`,
  },
  openGraph: {
    title: "Get Vaulted Help Center",
    description: "Detailed guides for collectors and sellers on Get Vaulted.",
    url: `${CANONICAL_SHARE_SITE_FALLBACK}/support`,
    type: "website",
  },
  robots: { index: true, follow: true },
};

function SupportEmailLink({ className }: { className?: string }) {
  return (
    <a href={`mailto:${SUPPORT_EMAIL}`} className={className}>
      {SUPPORT_EMAIL}
    </a>
  );
}

export default function SupportPage() {
  return (
    <main className="relative flex-1 overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(201,162,39,0.14),transparent)]"
      />

      <div className="relative mx-auto w-full max-w-4xl px-4 py-12 sm:px-6 sm:py-16 lg:px-10">
        <Link href="/" className="text-xs font-semibold uppercase tracking-wide text-gold-bright hover:underline">
          ← Home
        </Link>

        <header className="mt-6">
          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-gold-bright/90">Get Vaulted</p>
          <h1 className="font-display mt-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Help Center
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-zinc-300 sm:text-lg">
            Step-by-step guides for buying, selling, live shows, shipping, payments, trades, and your account.
          </p>
        </header>

        <div className="mt-8 rounded-2xl border border-gold/25 bg-gradient-to-br from-gold/10 via-zinc-950/80 to-zinc-950/60 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_24px_64px_-32px_rgba(201,162,39,0.25)] sm:p-6">
          <p className="text-[11px] font-bold uppercase tracking-wider text-gold-bright/90">Contact</p>
          <p className="mt-3 text-sm text-zinc-300">
            Email us at{" "}
            <SupportEmailLink className="font-semibold text-gold-bright hover:underline" />
          </p>
          <p className="mt-2 text-sm text-muted">We typically respond within 1–2 business days.</p>
        </div>

        <HelpCenterBrowse />

        <section className="mt-12 rounded-2xl border border-gold/30 bg-gold/5 p-5 sm:p-8">
          <h2 className="font-display text-xl font-semibold text-foreground">Still need help?</h2>
          <p className="mt-3 text-sm leading-relaxed text-zinc-300">
            Email us at{" "}
            <SupportEmailLink className="font-semibold text-gold-bright hover:underline" /> with your name, account
            email, order/trade/show details if available, and a short description of the issue.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <a
              href={SUPPORT_MAILTO}
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-gold px-5 py-3 text-sm font-bold text-black transition hover:bg-gold-bright"
            >
              Contact Support
            </a>
            <Link
              href="/community-guidelines"
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-foreground transition hover:border-gold/30 hover:bg-white/[0.06]"
            >
              Community Guidelines
            </Link>
            <Link
              href="/reporting-safety"
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-foreground transition hover:border-gold/30 hover:bg-white/[0.06]"
            >
              Reporting & Safety
            </Link>
            <Link
              href="/privacy"
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-foreground transition hover:border-gold/30 hover:bg-white/[0.06]"
            >
              Privacy Policy
            </Link>
            <Link
              href="/terms"
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-foreground transition hover:border-gold/30 hover:bg-white/[0.06]"
            >
              Terms of Service
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
