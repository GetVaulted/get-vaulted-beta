import Link from "next/link";
import type { ReactNode } from "react";

export function SupportPageShell({
  backHref = "/support",
  backLabel = "← Help Center",
  title,
  subtitle,
  children,
}: {
  backHref?: string;
  backLabel?: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <main className="relative flex-1 overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(201,162,39,0.14),transparent)]"
      />
      <div className="relative mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 sm:py-16 lg:px-10">
        <Link href={backHref} className="text-xs font-semibold uppercase tracking-wide text-gold-bright hover:underline">
          {backLabel}
        </Link>
        <header className="mt-6">
          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-gold-bright/90">Get Vaulted Support</p>
          <h1 className="font-display mt-3 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{title}</h1>
          {subtitle ? <p className="mt-3 text-sm leading-relaxed text-zinc-400">{subtitle}</p> : null}
        </header>
        <div className="mt-8">{children}</div>
      </div>
    </main>
  );
}
