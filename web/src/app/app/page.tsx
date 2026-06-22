import Link from "next/link";
import type { Metadata } from "next";
import { AppDownloadBadges } from "@/components/marketing/AppDownloadBadges";
import { CANONICAL_SHARE_SITE_FALLBACK } from "@/lib/live-room-share-metadata";

const PAGE_URL = `${CANONICAL_SHARE_SITE_FALLBACK}/app`;

export const metadata: Metadata = {
  title: "Get Vaulted App — Buy, Sell, Trade & Go Live",
  description:
    "The collector marketplace for sports cards, memorabilia, helmets, autographs, sneakers, watches, and more. Join live breaks, shop trusted sellers, trade securely, and sell with Seller HQ.",
  alternates: { canonical: PAGE_URL },
  openGraph: {
    title: "Get Vaulted — Buy. Sell. Trade. Go Live.",
    description:
      "The collector marketplace built for sports cards, memorabilia, helmets, autographs, sneakers, watches, and more.",
    url: PAGE_URL,
    type: "website",
  },
  robots: { index: true, follow: true },
};

const FEATURE_SECTIONS = [
  {
    id: "live-commerce",
    eyebrow: "Live Commerce",
    title: "Shop the drop in real time",
    items: [
      "Join live breaks",
      "Watch live auctions",
      "Interact with hosts in real time",
      "Discover new collectibles",
    ],
  },
  {
    id: "marketplace",
    eyebrow: "Marketplace",
    title: "Buy from trusted sellers",
    items: [
      "Buy from trusted sellers",
      "Sports cards",
      "Memorabilia",
      "Helmets",
      "Jerseys",
      "Sneakers",
      "Watches",
    ],
  },
  {
    id: "trade-center",
    eyebrow: "Trade Center",
    title: "Collector-to-collector deals",
    items: [
      "Secure collector-to-collector trading",
      "Trade offers",
      "Deal rooms",
      "Shipment tracking",
    ],
  },
  {
    id: "seller-hq",
    eyebrow: "Seller HQ",
    title: "Run your business in one place",
    items: [
      "Create listings",
      "Manage inventory",
      "Host live events",
      "Track sales and fulfillment",
      "Manage payouts",
    ],
  },
] as const;

const WHY_PILLARS = [
  {
    title: "Built by collectors",
    body: "Designed around how cards, memorabilia, and grails actually move — not generic e-commerce.",
  },
  {
    title: "Community-driven marketplace",
    body: "Follow sellers, join live rooms, and discover inventory from people who know the hobby.",
  },
  {
    title: "Live + marketplace together",
    body: "Breaks, auctions, buy-now listings, and trades — one platform instead of five apps.",
  },
  {
    title: "Secure Stripe payments",
    body: "Checkout and seller payouts powered by Stripe for trusted, structured commerce.",
  },
] as const;

function FeatureList({ items }: { items: readonly string[] }) {
  return (
    <ul className="mt-4 space-y-2.5 text-sm text-muted">
      {items.map((item) => (
        <li key={item} className="flex gap-2.5">
          <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-gold-bright/80" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export default function AppMarketingPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Get Vaulted",
    applicationCategory: "ShoppingApplication",
    operatingSystem: "iOS, Android",
    description:
      "The collector marketplace for sports cards, memorabilia, sneakers, watches, live breaks, and secure trading.",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    url: PAGE_URL,
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden border-b border-white/[0.07] bg-[linear-gradient(180deg,rgba(14,14,18,0.98)_0%,#000000_100%)]">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_-10%,rgba(201,162,39,0.16),transparent)]"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -right-24 top-20 h-64 w-64 rounded-full bg-[radial-gradient(circle_at_center,rgba(201,162,39,0.1),transparent_70%)] blur-3xl"
          />

          <div className="relative mx-auto w-full max-w-5xl px-4 py-14 sm:px-6 sm:py-20 lg:px-10 lg:py-24">
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-gold-bright/90">Get Vaulted</p>
            <h1 className="font-display mt-4 max-w-3xl text-4xl font-bold leading-[1.08] tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              Buy. Sell. Trade. Go Live.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-zinc-300 sm:text-lg">
              The collector marketplace built for sports cards, memorabilia, helmets, autographs, sneakers, watches, and
              more.
            </p>

            <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center">
              <a
                href="#download"
                className="inline-flex min-h-11 items-center justify-center rounded-full bg-gradient-to-r from-gold to-gold-bright px-7 text-sm font-bold uppercase tracking-wide text-zinc-950 shadow-[0_0_28px_-6px_rgba(201,162,39,0.55)] transition hover:brightness-110"
              >
                Download the App
              </a>
              <Link
                href="/marketplace"
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/15 bg-white/[0.04] px-7 text-sm font-bold uppercase tracking-wide text-foreground transition hover:border-gold/35 hover:bg-white/[0.06]"
              >
                Explore Marketplace
              </Link>
            </div>

            <AppDownloadBadges className="mt-8" size="large" />
          </div>
        </section>

        {/* Feature sections */}
        <div className="bg-[#050507]">
          {FEATURE_SECTIONS.map((section, index) => (
            <section
              key={section.id}
              id={section.id}
              className={`scroll-mt-16 border-t border-white/[0.06] py-12 sm:py-16 ${index % 2 === 1 ? "bg-[linear-gradient(180deg,#0c0c10_0%,#050507_100%)]" : ""}`}
            >
              <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-10">
                <p className="text-[11px] font-bold uppercase tracking-wider text-gold-bright/90">{section.eyebrow}</p>
                <h2 className="font-display mt-2 text-2xl font-semibold text-foreground sm:text-3xl">{section.title}</h2>
                <div className="mt-6 max-w-xl rounded-2xl border border-white/[0.08] bg-zinc-950/50 p-5 sm:p-6">
                  <FeatureList items={section.items} />
                </div>
              </div>
            </section>
          ))}

          {/* Why Get Vaulted */}
          <section id="why" className="scroll-mt-16 border-t border-white/[0.06] bg-[linear-gradient(180deg,#151518_0%,#050506_100%)] py-12 sm:py-16">
            <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-10">
              <p className="text-[11px] font-bold uppercase tracking-wider text-gold-bright/90">Why Get Vaulted</p>
              <h2 className="font-display mt-2 text-2xl font-semibold text-foreground sm:text-3xl">
                One platform for the modern collector
              </h2>
              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                {WHY_PILLARS.map((pillar) => (
                  <div
                    key={pillar.title}
                    className="rounded-2xl border border-white/10 bg-[#0c0c10] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_18px_48px_-28px_rgba(201,162,39,0.12)] transition hover:border-gold/25"
                  >
                    <h3 className="text-sm font-bold uppercase tracking-wide text-gold-bright">{pillar.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted">{pillar.body}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Download CTA */}
          <section
            id="download"
            className="scroll-mt-16 border-t border-gold/20 bg-gradient-to-br from-gold/10 via-zinc-950 to-zinc-950 py-12 sm:py-16"
          >
            <div className="mx-auto w-full max-w-5xl px-4 text-center sm:px-6 lg:px-10">
              <h2 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">Get the app</h2>
              <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-zinc-300 sm:text-base">
                Download Get Vaulted for iOS and Android. Shop, trade, and join live shows from anywhere.
              </p>
              <div className="mt-8 flex justify-center">
                <AppDownloadBadges size="large" />
              </div>
            </div>
          </section>

          {/* Page footer */}
          <footer className="border-t border-white/[0.08] bg-[#050507] py-8">
            <div className="mx-auto flex w-full max-w-5xl flex-col items-center justify-between gap-4 px-4 sm:flex-row sm:px-6 lg:px-10">
              <p className="font-display text-sm font-bold text-foreground">
                <span className="text-gold-bright">Get</span>Vaulted
              </p>
              <nav aria-label="Legal and support" className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-muted">
                <Link href="/support" className="transition hover:text-foreground">
                  Support
                </Link>
                <Link href="/privacy" className="transition hover:text-foreground">
                  Privacy Policy
                </Link>
                <Link href="/terms" className="transition hover:text-foreground">
                  Terms of Service
                </Link>
              </nav>
            </div>
          </footer>
        </div>
      </main>
    </>
  );
}
