import Link from "next/link";
import { authOptions, getServerSessionSafe } from "@/lib/auth";

export default async function TradeHubPage() {
  const session = await getServerSessionSafe();
  const signedIn = Boolean(session?.user?.id);

  return (
    <main className="relative flex min-h-0 flex-1 flex-col bg-[linear-gradient(180deg,rgba(14,14,18,0.55)_0%,#030303_38%,#030303_100%)]">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[min(400px,56vh)] bg-[radial-gradient(ellipse_80%_55%_at_50%_-8%,rgba(201,162,39,0.08),transparent_55%)]"
        aria-hidden
      />
      <section className="relative mx-auto w-full max-w-[1200px] px-4 pb-16 pt-6 sm:px-6 lg:px-10">
        <div className="rounded-3xl border border-white/[0.1] bg-[#0a0a0d]/90 p-6 shadow-[0_28px_60px_-36px_rgba(0,0,0,0.85)] sm:p-8">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-gold-bright/85">Trade</p>
          <h1 className="font-display mt-3 text-2xl font-black tracking-tight text-foreground sm:text-4xl">
            Structured trade offers on Get Vaulted
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-400 sm:text-base">
            Build clear offers with cards and cash, track agreement status, and coordinate shipping once both sides
            accept.
          </p>
          <p className="mt-2 max-w-2xl text-xs text-zinc-500">
            Offers and timelines are recorded in your trade history. After acceptance, parties coordinate fulfillment
            directly — use tracked shipping and keep details in the trade thread when available.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 sm:max-w-xl">
            <Link
              href={signedIn ? "/trade/new" : "/signin?returnTo=%2Ftrade%2Fnew"}
              className="inline-flex h-12 items-center justify-center rounded-full bg-gradient-to-r from-gold to-gold-bright px-6 text-sm font-bold text-zinc-950 shadow-[0_12px_34px_-14px_rgba(201,162,39,0.6)] transition hover:brightness-110"
            >
              Start a Trade
            </Link>
            <Link
              href={signedIn ? "/trade/offers" : "/signin?returnTo=%2Ftrade%2Foffers"}
              className="inline-flex h-12 items-center justify-center rounded-full border border-white/15 px-6 text-sm font-semibold text-zinc-100 transition hover:border-gold/40 hover:text-gold-bright"
            >
              View Trade Offers
            </Link>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            "Add your item",
            "Choose what you want",
            "Add cash if needed",
            "Send offer",
            "Ship with tracking once accepted",
          ].map((step, idx) => (
            <article
              key={step}
              className="rounded-2xl border border-white/[0.08] bg-[#09090c]/85 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
            >
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">Step {idx + 1}</p>
              <p className="mt-2 text-sm font-semibold text-zinc-100">{step}</p>
            </article>
          ))}
        </div>
        <div className="mt-4 rounded-2xl border border-white/[0.08] bg-[#09090c]/75 p-4">
          <p className="text-xs font-semibold text-zinc-200">Staying aligned</p>
          <p className="mt-1 text-xs text-zinc-500">
            Use the offer detail page for structured terms and status. For day-to-day coordination, use whatever channel
            you and your counterparty already share; the offer record remains the reference if anything is unclear.
          </p>
        </div>
      </section>
    </main>
  );
}
