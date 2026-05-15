"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links: { href: string; label: string; exact?: boolean }[] = [
  { href: "/admin", label: "Overview", exact: true },
  { href: "/admin/listings", label: "Listings" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/orders", label: "Orders" },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <header className="border-b border-white/[0.08] bg-[#08080a]/95 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-[1920px] flex-wrap items-center justify-between gap-3 px-3 py-3 sm:px-4 lg:px-10">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-xs font-semibold text-zinc-500 hover:text-zinc-300">
            ← Site
          </Link>
          <p className="font-display text-sm font-bold tracking-tight text-foreground">
            <span className="text-gold-bright">Admin</span>
            <span className="text-zinc-500"> · Get Vaulted</span>
          </p>
        </div>
        <nav className="flex flex-wrap gap-1" aria-label="Admin">
          {links.map(({ href, label, exact }) => {
            const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  active ? "bg-gold/15 text-gold-bright" : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
                }`}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
