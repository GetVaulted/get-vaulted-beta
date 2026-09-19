"use client";

import { usePathname } from "next/navigation";
import { WatchlistToastHost } from "@/components/marketplace/WatchlistToastHost";
import { Navbar } from "@/components/layout/Navbar";
import { SiteFooter } from "@/components/layout/SiteFooter";

const BARE_PATH_PREFIXES = ["/account/sales/print-label"] as const;

// Authenticated account/seller dashboards: keep the top nav, but the full
// marketing footer (wordmark, tagline, Shop/Discover/Legal columns) does not
// belong bolted onto a signed-in workspace page.
const NO_FOOTER_PATH_PREFIXES = ["/account"] as const;

function matchesPrefix(pathname: string | null, prefixes: readonly string[]): boolean {
  if (!pathname) return false;
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function isBarePath(pathname: string | null): boolean {
  return matchesPrefix(pathname, BARE_PATH_PREFIXES);
}

function isNoFooterPath(pathname: string | null): boolean {
  return matchesPrefix(pathname, NO_FOOTER_PATH_PREFIXES);
}

type AppShellProps = {
  children: React.ReactNode;
  liveMarketplaceEnabled: boolean;
};

/** Site chrome wrapper — strips nav/footer on bare routes like label print. */
export function AppShell({ children, liveMarketplaceEnabled }: AppShellProps) {
  const pathname = usePathname();
  const bare = isBarePath(pathname);

  if (bare) {
    return <div className="min-h-dvh w-full">{children}</div>;
  }

  const noFooter = isNoFooterPath(pathname);

  return (
    <>
      <Navbar />
      <WatchlistToastHost />
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      {noFooter ? null : <SiteFooter liveMarketplaceEnabled={liveMarketplaceEnabled} />}
    </>
  );
}
