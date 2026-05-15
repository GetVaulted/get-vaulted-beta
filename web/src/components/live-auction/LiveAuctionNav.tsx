import Link from "next/link";

const links = [
  { href: "/marketplace", label: "Marketplace" },
  { href: "/live", label: "Live Breaks" },
] as const;

export function LiveAuctionNav() {
  return (
    <header className="sticky top-0 md:top-[var(--site-header-offset)] z-40 border-b border-zinc-800/90 bg-black/95 backdrop-blur-xl">
      <div className="mx-auto flex h-12 max-w-[1920px] items-center justify-between gap-4 px-4 sm:px-5">
        <Link href="/" className="shrink-0 font-display text-lg font-bold tracking-tight text-white">
          <span className="text-[#facc15]">Get</span>
          <span className="text-zinc-400">Vaulted</span>
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2">
          {links.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="rounded-lg px-3 py-2 text-xs font-semibold text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-[#facc15] sm:text-sm"
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
