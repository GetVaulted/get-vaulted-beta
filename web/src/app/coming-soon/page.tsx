import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Live — Coming soon | Get Vaulted",
  description: "Live breaks and live rooms are not open yet. Browse the marketplace for graded cards and collectibles.",
};

export default function LiveComingSoonPage() {
  return (
    <main className="mx-auto flex min-h-[min(70dvh,32rem)] max-w-lg flex-col justify-center px-4 py-16 text-center">
      <p className="text-[10px] font-black uppercase tracking-[0.28em] text-gold-bright/90">Get Vaulted</p>
      <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-zinc-50 sm:text-4xl">Live is almost here</h1>
      <p className="mt-4 text-sm leading-relaxed text-zinc-400">
        Live breaks and live rooms are paused while we finish the marketplace launch. Check back soon, or explore listings
        in the meantime.
      </p>
      <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-gold/20 px-6 text-sm font-bold text-gold-bright ring-1 ring-gold/40 transition hover:bg-gold/25"
        >
          Browse marketplace
        </Link>
        <Link href="/sell" className="text-sm font-semibold text-zinc-400 underline-offset-4 hover:text-zinc-200 hover:underline">
          Sell
        </Link>
      </div>
    </main>
  );
}
