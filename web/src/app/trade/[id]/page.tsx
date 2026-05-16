import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { TradeActionBar } from "@/components/trade/TradeActionBar";
import { TradeStatusTimeline } from "@/components/trade/TradeStatusTimeline";
import { TradeValueSummary } from "@/components/trade/TradeValueSummary";
import { authOptions, getServerSessionSafe } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { expireOfferIfNeeded, formatMoney } from "@/lib/trade-offers";

export const dynamic = "force-dynamic";

export default async function TradeOfferDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getServerSessionSafe();
  if (!session?.user?.id) {
    redirect(`/signin?returnTo=${encodeURIComponent(`/trade/${encodeURIComponent(id)}`)}`);
  }

  const offer = await prisma.tradeOffer.findUnique({
    where: { id: decodeURIComponent(id) },
    include: {
      proposer: { select: { username: true } },
      recipient: { select: { username: true } },
      items: { orderBy: { createdAt: "asc" } },
      events: {
        orderBy: { createdAt: "asc" },
        include: { actorUser: { select: { username: true } } },
      },
    },
  });
  if (!offer) return notFound();
  const isParticipant = offer.proposerId === session.user.id || offer.recipientId === session.user.id;
  const isAdmin = session.user.role === "admin";
  if (!isParticipant && !isAdmin) return notFound();
  await expireOfferIfNeeded(prisma, { id: offer.id, status: offer.status, expiresAt: offer.expiresAt });
  const fresh = await prisma.tradeOffer.findUnique({
    where: { id: decodeURIComponent(id) },
    include: {
      proposer: { select: { username: true } },
      recipient: { select: { username: true } },
      items: { orderBy: { createdAt: "asc" } },
      events: {
        orderBy: { createdAt: "asc" },
        include: { actorUser: { select: { username: true } } },
      },
    },
  });
  if (!fresh) return notFound();

  const proposerItems = fresh.items.filter((item) => item.side === "proposer");
  const recipientItems = fresh.items.filter((item) => item.side === "recipient");
  const offeredValue = proposerItems.reduce((sum, item) => sum + item.listingPriceUsdSnapshot, 0);
  const requestedValue = recipientItems.reduce((sum, item) => sum + item.listingPriceUsdSnapshot, 0);

  const allowedActions: Array<"accept" | "decline" | "cancel" | "counter"> = [];
  if (fresh.status === "pending" || fresh.status === "countered") {
    if (session.user.id === fresh.recipientId) {
      allowedActions.push("accept", "decline");
    }
    if (session.user.id === fresh.proposerId) {
      allowedActions.push("cancel");
    }
    if (session.user.id === fresh.proposerId || session.user.id === fresh.recipientId) {
      allowedActions.push("counter");
    }
  }

  return (
    <main className="relative flex min-h-0 flex-1 flex-col bg-[linear-gradient(180deg,rgba(14,14,18,0.55)_0%,#030303_38%,#030303_100%)]">
      <div className="mx-auto w-full max-w-[1000px] px-4 pb-16 pt-6 sm:px-6 lg:px-8">
        <header className="rounded-2xl border border-white/[0.08] bg-[#09090c]/90 p-5">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Trade Offer</p>
          <h1 className="font-display mt-1 text-2xl font-black tracking-tight text-foreground">Offer details</h1>
          <p className="mt-2 text-sm text-zinc-400">
            @{fresh.proposer.username} ↔ @{fresh.recipient.username} · Status:{" "}
            <span className="font-semibold text-zinc-200">{fresh.status}</span>
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            This page is the source of truth for items, cash, and offer status. Coordinate fulfillment details with your
            counterparty using the contact method you already trust.
          </p>
          {fresh.expiresAt ? (
            <p className="mt-1 text-xs text-zinc-500">Expires {new Date(fresh.expiresAt).toLocaleString()}</p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/trade/new" className="rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-zinc-200 hover:border-gold/35 hover:text-gold-bright">
              Start another trade
            </Link>
            <Link href="/trade/offers" className="rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-zinc-200 hover:border-white/25">
              Back to offers
            </Link>
          </div>
        </header>

        <section className="mt-5 grid gap-4 md:grid-cols-2">
          <article className="rounded-2xl border border-white/[0.08] bg-[#09090c]/85 p-4">
            <p className="text-sm font-semibold text-zinc-100">Your offered items</p>
            <ul className="mt-3 space-y-2">
              {proposerItems.map((item) => (
                <li key={item.id} className="rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2">
                  <p className="text-sm font-semibold text-zinc-100">{item.listingTitleSnapshot}</p>
                  <p className="text-xs text-zinc-500">
                    {item.listingConditionSnapshot} · {formatMoney(item.listingPriceUsdSnapshot)}
                  </p>
                </li>
              ))}
            </ul>
          </article>
          <article className="rounded-2xl border border-white/[0.08] bg-[#09090c]/85 p-4">
            <p className="text-sm font-semibold text-zinc-100">Requested items</p>
            <ul className="mt-3 space-y-2">
              {recipientItems.map((item) => (
                <li key={item.id} className="rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2">
                  <p className="text-sm font-semibold text-zinc-100">{item.listingTitleSnapshot}</p>
                  <p className="text-xs text-zinc-500">
                    {item.listingConditionSnapshot} · {formatMoney(item.listingPriceUsdSnapshot)}
                  </p>
                </li>
              ))}
            </ul>
          </article>
        </section>
        <div className="mt-4">
          <TradeValueSummary
            offeredCount={proposerItems.length}
            requestedCount={recipientItems.length}
            offeredValue={offeredValue}
            requestedValue={requestedValue}
            proposerCashUsd={fresh.proposerCashUsd}
            recipientCashUsd={fresh.recipientCashUsd}
          />
        </div>
        {fresh.messageToRecipient ? (
          <section className="mt-4 rounded-2xl border border-white/[0.08] bg-[#09090c]/85 p-4">
            <p className="text-sm font-semibold text-zinc-100">Original message</p>
            <p className="mt-2 text-sm text-zinc-300">{fresh.messageToRecipient}</p>
          </section>
        ) : null}
        {fresh.status === "accepted" ? (
          <section className="mt-4 rounded-2xl border border-emerald-300/20 bg-emerald-950/10 p-4">
            <p className="text-sm font-semibold text-emerald-100">Next step: arrange shipping</p>
            <p className="mt-1 text-xs text-emerald-100/80">
              Agree on a tracked carrier, share tracking when you ship, and keep a record outside the app if you need
              it for disputes.
            </p>
          </section>
        ) : null}
        <section className="mt-4 rounded-2xl border border-white/[0.08] bg-[#09090c]/85 p-4">
          <p className="text-sm font-semibold text-zinc-100">Coordination</p>
          <p className="mt-1 text-xs text-zinc-500">
            Use email or another channel you both use today. The offer timeline and status on this page stay
            authoritative for what was agreed in Get Vaulted.
          </p>
        </section>
        <div className="mt-4">
          <TradeStatusTimeline
            events={fresh.events.map((evt) => ({
              id: evt.id,
              type: evt.type,
              note: evt.note,
              createdAtIso: evt.createdAt.toISOString(),
              actorUsername: evt.actorUser?.username ?? null,
            }))}
          />
        </div>
        <div className="mt-4">
          <TradeActionBar offerId={fresh.id} allowedActions={allowedActions} />
        </div>
      </div>
    </main>
  );
}
