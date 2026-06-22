import Link from "next/link";
import type { Metadata } from "next";
import { CANONICAL_SHARE_SITE_FALLBACK } from "@/lib/live-room-share-metadata";

const SUPPORT_EMAIL = "support@shopgetvaulted.com";
const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}?subject=Get%20Vaulted%20Support%20Request`;

export const metadata: Metadata = {
  title: "Get Vaulted Support",
  description:
    "Get help with your Get Vaulted account, marketplace orders, live shows, trades, seller tools, and technical issues.",
  alternates: {
    canonical: `${CANONICAL_SHARE_SITE_FALLBACK}/support`,
  },
  openGraph: {
    title: "Get Vaulted Support",
    description:
      "Need help with your account, orders, live shows, trades, or seller tools? We're here to help.",
    url: `${CANONICAL_SHARE_SITE_FALLBACK}/support`,
    type: "website",
  },
  robots: { index: true, follow: true },
};

const SUPPORT_SECTIONS = [
  {
    title: "Account Support",
    items: [
      "Login issues",
      "Password reset",
      "Apple Sign In / Google Sign In help",
      "Account access questions",
    ],
  },
  {
    title: "Marketplace Orders",
    items: [
      "Buying items",
      "Order status",
      "Shipping updates",
      "Returns or order issues",
    ],
  },
  {
    title: "Live Shows & Breaks",
    items: [
      "Joining live shows",
      "Participating in breaks",
      "Bidding or checkout issues",
      "Reporting a live show problem",
    ],
  },
  {
    title: "Trade Center",
    items: [
      "Trade offers",
      "Deal rooms",
      "Shipping labels",
      "Trade disputes",
    ],
  },
  {
    title: "Seller Support",
    items: [
      "Seller HQ",
      "Creating listings",
      "Hosting Vault Events",
      "Fulfillment",
      "Stripe Connect payouts",
    ],
  },
  {
    title: "Technical Issues",
    items: [
      "App crashes",
      "Payment errors",
      "Notification issues",
      "Bug reports",
    ],
  },
] as const;

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
            Get Vaulted Support
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-zinc-300 sm:text-lg">
            Need help with your account, orders, live shows, trades, or seller tools? We&apos;re here to help.
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

        <div className="mt-10 grid gap-4 sm:grid-cols-2 sm:gap-5">
          {SUPPORT_SECTIONS.map((section) => (
            <section
              key={section.title}
              className="rounded-2xl border border-white/[0.08] bg-zinc-950/60 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:p-6"
            >
              <h2 className="font-display text-lg font-semibold text-foreground">{section.title}</h2>
              <ul className="mt-3 space-y-2 text-sm text-muted">
                {section.items.map((item) => (
                  <li key={item} className="flex gap-2">
                    <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-gold-bright/70" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <section className="mt-10 rounded-2xl border border-gold/30 bg-gold/5 p-5 sm:p-8">
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
