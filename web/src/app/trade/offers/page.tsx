import Link from "next/link";
import { redirect } from "next/navigation";
import { TradeOffersPageClient } from "@/components/trade/TradeOffersPageClient";
import { authOptions, getServerSessionSafe } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { expireOfferIfNeeded } from "@/lib/trade-offers";

export const dynamic = "force-dynamic";

export default async function TradeOffersPage() {
  const session = await getServerSessionSafe();
  if (!session?.user?.id) {
    redirect("/signin?returnTo=%2Ftrade%2Foffers");
  }
  const userId = session.user.id;

  const raw = await prisma.tradeOffer.findMany({
    where: { OR: [{ proposerId: userId }, { recipientId: userId }] },
    orderBy: { updatedAt: "desc" },
    include: {
      proposer: { select: { username: true } },
      recipient: { select: { username: true } },
      items: { select: { side: true, listingPriceUsdSnapshot: true } },
    },
  });
  for (const offer of raw) {
    await expireOfferIfNeeded(prisma, { id: offer.id, status: offer.status, expiresAt: offer.expiresAt });
  }
  const offers = await prisma.tradeOffer.findMany({
    where: { OR: [{ proposerId: userId }, { recipientId: userId }] },
    orderBy: { updatedAt: "desc" },
    include: {
      proposer: { select: { username: true } },
      recipient: { select: { username: true } },
      items: { select: { side: true, listingPriceUsdSnapshot: true } },
    },
  });

  const cards = offers.map((offer) => {
    const offered = offer.items.filter((i) => i.side === "proposer");
    const requested = offer.items.filter((i) => i.side === "recipient");
    return {
      id: offer.id,
      status: offer.status,
      proposerId: offer.proposerId,
      recipientId: offer.recipientId,
      counterpartyUsername: offer.proposerId === userId ? offer.recipient.username : offer.proposer.username,
      offeredCount: offered.length,
      requestedCount: requested.length,
      proposerCashUsd: offer.proposerCashUsd,
      recipientCashUsd: offer.recipientCashUsd,
      createdAtIso: offer.createdAt.toISOString(),
      updatedAtIso: offer.updatedAt.toISOString(),
    };
  });

  return (
    <main className="relative flex min-h-0 flex-1 flex-col bg-[linear-gradient(180deg,rgba(14,14,18,0.55)_0%,#030303_38%,#030303_100%)]">
      <div className="mx-auto w-full max-w-[1000px] px-4 pb-16 pt-6 sm:px-6 lg:px-8">
        <header className="rounded-2xl border border-white/[0.08] bg-[#09090c]/90 p-5">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Trade Offers</p>
          <h1 className="font-display mt-1 text-2xl font-black tracking-tight text-foreground">Manage your offers</h1>
          <p className="mt-2 text-sm text-zinc-400">Review received offers, track sent offers, and handle active decisions.</p>
          <p className="mt-1 text-xs text-zinc-500">Structured statuses and timeline history remain the source of truth.</p>
          <div className="mt-3">
            <Link href="/trade/new" className="rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-zinc-200 hover:border-gold/35 hover:text-gold-bright">
              Start a new trade
            </Link>
          </div>
        </header>
        <section className="mt-5">
          {cards.length === 0 ? (
            <div className="rounded-2xl border border-white/[0.08] bg-[#0a0a0d]/80 px-6 py-12 text-center">
              <p className="text-sm font-medium text-zinc-300">No trade offers yet</p>
              <p className="mt-2 text-xs text-zinc-500">
                When you send or receive structured trade offers, they will appear here with full status history.
              </p>
              <Link
                href="/trade/new"
                className="mt-5 inline-flex h-10 items-center justify-center rounded-full bg-gradient-to-r from-gold to-gold-bright px-6 text-sm font-bold text-zinc-950 shadow-[0_12px_34px_-14px_rgba(201,162,39,0.6)] transition hover:brightness-110"
              >
                Start a trade
              </Link>
            </div>
          ) : (
            <TradeOffersPageClient userId={userId} offers={cards} />
          )}
        </section>
      </div>
    </main>
  );
}
