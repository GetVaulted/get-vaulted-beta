import Link from "next/link";
import { getServerSessionSafe } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const START_STEPS = [
  "Add your item",
  "Choose what you want",
  "Add cash if needed",
  "Send offer",
  "Ship with tracking once accepted",
] as const;

export default async function TradeHubPage() {
  const session = await getServerSessionSafe();
  const userId = session?.user?.id;
  const signedIn = Boolean(userId);

  const offerCount = signedIn
    ? await prisma.tradeOffer.count({
        where: { OR: [{ proposerId: userId }, { recipientId: userId }] },
      })
    : 0;

  return (
    <main className="relative flex min-h-0 flex-1 flex-col bg-[linear-gradient(180deg,rgba(14,14,18,0.55)_0%,#030303_38%,#030303_100%)]">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[min(400px,56vh)] bg-[radial-gradient(ellipse_80%_55%_at_50%_-8%,rgba(201,162,39,0.08),transparent_55%)]"
        aria-hidden
      />
      <section className="relative mx-auto w-full max-w-[1200px] px-4 pb-16 pt-6 sm:px-6 lg:px-10">
        <header className="mb-6">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-gold-bright/85">Trade Center</p>
          <h1 className="font-display mt-2 text-2xl font-black tracking-tight text-foreground sm:text-4xl">
            Structured trade offers on Get Vaulted
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-400 sm:text-base">
            Start a protected offer or manage your trade block — incoming, sent, and active deals in one place.
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
          <article className="rounded-3xl border border-white/[0.1] bg-[#0a0a0d]/90 p-6 shadow-[0_28px_60px_-36px_rgba(0,0,0,0.85)] sm:p-8">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-gold-bright/85">Start a trade</p>
            <h2 className="font-display mt-2 text-xl font-black tracking-tight text-foreground sm:text-2xl">
              Build and send a protected offer
            </h2>
            <p className="mt-2 text-sm text-zinc-400">
              Pick your card, choose what you want in return, add cash if needed, and send a structured offer with full
              status history.
            </p>
            <Link
              href={signedIn ? "/trade/new" : "/signin?returnTo=%2Ftrade%2Fnew"}
              className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-full bg-gradient-to-r from-gold to-gold-bright px-6 text-sm font-bold text-zinc-950 shadow-[0_12px_34px_-14px_rgba(201,162,39,0.6)] transition hover:brightness-110 sm:w-auto"
            >
              Start a trade
            </Link>
            <div className="mt-6 space-y-3">
              {START_STEPS.map((step, idx) => (
                <div
                  key={step}
                  className="flex items-start gap-3 rounded-xl border border-white/[0.06] bg-[#09090c]/75 px-3 py-2.5"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-gold/30 bg-gold/10 text-[11px] font-bold text-gold-bright">
                    {idx + 1}
                  </span>
                  <p className="pt-0.5 text-sm font-semibold text-zinc-200">{step}</p>
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-3xl border border-gold/20 bg-[#0a0a0d]/90 p-6 shadow-[0_28px_60px_-36px_rgba(201,162,39,0.25)] sm:p-8">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-gold-bright/85">Trade block</p>
            <h2 className="font-display mt-2 text-xl font-black tracking-tight text-foreground sm:text-2xl">
              Your offers and active deals
            </h2>
            <p className="mt-2 text-sm text-zinc-400">
              Review incoming offers, track negotiations, and follow active trades through acceptance and shipping.
            </p>
            {signedIn ? (
              <p className="mt-3 text-xs font-semibold text-zinc-500">
                {offerCount === 0
                  ? "No offers in your trade block yet."
                  : `${offerCount} ${offerCount === 1 ? "offer" : "offers"} in your trade block.`}
              </p>
            ) : (
              <p className="mt-3 text-xs font-semibold text-zinc-500">Sign in to sync your trade block.</p>
            )}
            <Link
              href={signedIn ? "/trade/offers" : "/signin?returnTo=%2Ftrade%2Foffers"}
              className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-full border border-white/15 px-6 text-sm font-semibold text-zinc-100 transition hover:border-gold/40 hover:text-gold-bright sm:w-auto"
            >
              Open trade block
            </Link>
            <div className="mt-6 rounded-2xl border border-white/[0.08] bg-[#09090c]/75 p-4">
              <p className="text-xs font-semibold text-zinc-200">What lives here</p>
              <ul className="mt-2 space-y-1.5 text-xs text-zinc-500">
                <li>Received and sent offers</li>
                <li>Counter-offers and negotiations</li>
                <li>Accepted trades awaiting fulfillment</li>
                <li>Completed trade history</li>
              </ul>
            </div>
            <div className="mt-4 rounded-2xl border border-white/[0.08] bg-[#09090c]/75 p-4">
              <p className="text-xs font-semibold text-zinc-200">Staying aligned</p>
              <p className="mt-1 text-xs text-zinc-500">
                The offer record is your source of truth for terms and status. Keep shipping and coordination details in
                the trade thread when available.
              </p>
            </div>
          </article>
        </div>
      </section>
    </main>
  );
}
