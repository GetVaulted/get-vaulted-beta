"use client";

import { usePathname } from "next/navigation";
import { WatchlistToastHost } from "@/components/marketplace/WatchlistToastHost";
import { Navbar } from "@/components/layout/Navbar";
import { SiteFooter } from "@/components/layout/SiteFooter";

const BARE_PATH_PREFIXES = ["/account/sales/print-label"] as const;

function isBarePath(pathname: string | null): boolean {
  if (!pathname) return false;
  return BARE_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/** Seller host console must grow with content so the document can scroll below the stage. */
function isSellerHostConsolePath(pathname: string | null): boolean {
  if (!pathname) return false;
  return /^\/seller\/live\/[^/]+\/console\/?$/.test(pathname);
}

type AppShellProps = {
  children: React.ReactNode;
  liveMarketplaceEnabled: boolean;
};

/** Site chrome wrapper — strips nav/footer on bare routes like label print. */
export function AppShell({ children, liveMarketplaceEnabled }: AppShellProps) {
  const pathname = usePathname();
  const bare = isBarePath(pathname);
  const hostConsole = isSellerHostConsolePath(pathname);

  if (bare) {
    return <div className="min-h-dvh w-full">{children}</div>;
  }

  return (
    <>
      <Navbar />
      <WatchlistToastHost />
      <div className={hostConsole ? "w-full shrink-0" : "flex min-h-0 flex-1 flex-col"}>{children}</div>
      <SiteFooter liveMarketplaceEnabled={liveMarketplaceEnabled} />
    </>
  );
}
