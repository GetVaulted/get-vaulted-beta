import Link from "next/link";

function buildFooterCols(liveMarketplaceEnabled: boolean) {
  const liveHref = liveMarketplaceEnabled ? "/live" : "/coming-soon";
  return [
    {
      title: "Shop",
      links: [
        { href: "/marketplace", label: "Marketplace" },
        { href: "/#live-now", label: "Live breaks" },
        { href: "/#upcoming-breaks", label: "Schedule" },
      ],
    },
    {
      title: "Discover",
      links: [
        { href: "/#trusted-by", label: "Trust & safety" },
        { href: liveHref, label: "Live rooms" },
        { href: "/trade", label: "Trade hub" },
      ],
    },
    {
      title: "Legal",
      links: [
        { href: "/terms", label: "Terms of service" },
        { href: "/privacy", label: "Privacy policy" },
        { href: "/community-guidelines", label: "Community guidelines" },
        { href: "/reporting-safety", label: "Reporting & safety" },
        { href: "/terms#payments-stripe-connect", label: "Payments & Stripe" },
        { href: "/terms#seller-obligations", label: "Seller obligations" },
      ],
    },
  ] as const;
}

type SiteFooterProps = {
  liveMarketplaceEnabled?: boolean;
};

export function SiteFooter({ liveMarketplaceEnabled = true }: SiteFooterProps) {
  const cols = buildFooterCols(liveMarketplaceEnabled);

  return (
    <footer className="w-full border-t border-border-subtle bg-[#050507]">
      <div className="mx-auto w-full max-w-[1920px] px-6 py-8 sm:px-6 lg:px-10">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="font-display text-lg font-bold text-foreground">
              <span className="text-gold-bright">Get</span>Vaulted
            </p>
            <p className="mt-2 max-w-xs text-xs leading-relaxed text-muted">
              Live breaks, marketplace listings, and trades—built for collectors who want speed,
              transparency, and vault-grade fulfillment.
            </p>
          </div>
          {cols.map((col) => (
            <div key={col.title}>
              <p className="text-[11px] font-bold uppercase tracking-wider text-gold-bright/90">{col.title}</p>
              <ul className="mt-3 space-y-2">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <Link href={l.href} className="text-sm text-muted transition-colors hover:text-foreground">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-6 text-[11px] text-muted">
          <p>© {new Date().getFullYear()} Get Vaulted. All rights reserved.</p>
          <div className="flex flex-wrap gap-4">
            <Link href="/terms" className="hover:text-foreground">
              Terms
            </Link>
            <Link href="/privacy" className="hover:text-foreground">
              Privacy
            </Link>
            <Link href="/community-guidelines" className="hover:text-foreground">
              Guidelines
            </Link>
            <Link href="/reporting-safety" className="hover:text-foreground">
              Safety
            </Link>
            <Link href="/terms#payments-stripe-connect" className="hover:text-foreground">
              {"Payments & Stripe"}
            </Link>
            <Link href="/terms#seller-obligations" className="hover:text-foreground">
              Seller policy
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
