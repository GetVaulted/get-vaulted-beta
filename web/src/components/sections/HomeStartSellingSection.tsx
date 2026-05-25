import Link from "next/link";

export function HomeStartSellingSection() {
  return (
    <section
      id="start-selling"
      className="scroll-mt-16 border-b border-white/[0.06] bg-[linear-gradient(180deg,#0e0e12_0%,#050508_100%)] py-12 sm:py-16"
      aria-labelledby="start-selling-title"
    >
      <div className="mx-auto w-full max-w-[1920px] px-3 sm:px-4 lg:px-10">
        <div className="relative overflow-hidden rounded-2xl border border-gold/25 bg-[linear-gradient(135deg,rgba(201,162,39,0.14)_0%,rgba(12,12,16,0.95)_45%,#08080c_100%)] px-6 py-10 sm:px-10 sm:py-12">
          <div
            className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-gold/10 blur-3xl"
            aria-hidden
          />
          <div className="relative max-w-2xl">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-gold-bright">For collectors & breakers</p>
            <h2 id="start-selling-title" className="mt-2 text-2xl font-bold tracking-tight text-zinc-50 sm:text-3xl">
              Start Selling on Get Vaulted
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-zinc-400 sm:text-base">
              List fixed-price slabs, accept offers, and host live breaks from one account. Buyers shop the
              marketplace, watch your shows, and checkout with vault-ready shipping.
            </p>
            <ul className="mt-5 flex flex-wrap gap-2 text-[11px] font-medium text-zinc-400">
              {["Free to list", "Live + marketplace", "Secure payouts"].map((item) => (
                <li
                  key={item}
                  className="rounded-full border border-white/10 bg-black/30 px-3 py-1"
                >
                  {item}
                </li>
              ))}
            </ul>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href="/account/seller"
                className="inline-flex h-11 items-center justify-center rounded-full bg-gradient-to-r from-gold to-gold-bright px-6 text-sm font-bold text-zinc-950 shadow-[0_0_28px_-6px_rgba(201,162,39,0.55)] transition hover:brightness-110"
              >
                Start Seller Setup
              </Link>
              <Link
                href="/marketplace"
                className="inline-flex h-11 items-center justify-center rounded-full border border-white/15 px-6 text-sm font-semibold text-zinc-200 transition hover:border-gold/35 hover:text-gold-bright"
              >
                Browse marketplace
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
