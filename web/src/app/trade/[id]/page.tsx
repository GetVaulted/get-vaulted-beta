import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { TradeActionBar } from "@/components/trade/TradeActionBar";
import { TradeAdminEscrowActions } from "@/components/trade/TradeAdminEscrowActions";
import { TradeCashPayButton } from "@/components/trade/TradeCashPayButton";
import { TradeDepositPayButton } from "@/components/trade/TradeDepositPayButton";
import { TradeDisputeButton } from "@/components/trade/TradeDisputeButton";
import { TradeFulfillmentActions } from "@/components/trade/TradeFulfillmentActions";
import { TradeOfferConversationButton } from "@/components/trade/TradeOfferConversationButton";
import { TradePlatformFeePayButton } from "@/components/trade/TradePlatformFeePayButton";
import { TradeStatusTimeline } from "@/components/trade/TradeStatusTimeline";
import { TradeValueSummary } from "@/components/trade/TradeValueSummary";
import { getServerSessionSafe } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { GET_VAULTED_TRADE_PLATFORM_FEE_USD } from "@/lib/trade-platform-fee";
import {
  resolveTradeSecurityDepositUsd,
  tradeRequiresSecurityDeposit,
} from "@/lib/trade-security-deposit";
import { expireOfferIfNeeded, formatMoney, resolveTradeCashParties } from "@/lib/trade-offers";
import { isTradeCashHeld } from "@/lib/trade-cash-escrow";
import {
  TRADE_AFTER_ACCEPT_NOTE,
  TRADE_CASH_SETTLEMENT_NOTE,
  TRADE_FULFILLMENT_NOTE,
  TRADE_HUB_ALIGNED_NOTE,
} from "@/lib/trade-trust-copy";

export const dynamic = "force-dynamic";

export default async function TradeOfferDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ fee?: string; cash?: string; deposit?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const feeFlash = sp?.fee;
  const cashFlash = sp?.cash;
  const depositFlash = sp?.deposit;
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

  const viewerIsProposer = session.user.id === fresh.proposerId;
  const viewerFeePaid = viewerIsProposer
    ? Boolean(fresh.proposerPlatformFeePaidAt)
    : session.user.id === fresh.recipientId
      ? Boolean(fresh.recipientPlatformFeePaidAt)
      : true;
  const partnerFeePaid = viewerIsProposer
    ? Boolean(fresh.recipientPlatformFeePaidAt)
    : Boolean(fresh.proposerPlatformFeePaidAt);
  const cashTotal = Math.max(0, fresh.proposerCashUsd) + Math.max(0, fresh.recipientCashUsd);
  const cashSides = resolveTradeCashParties({
    proposerId: fresh.proposerId,
    recipientId: fresh.recipientId,
    proposerCashUsd: fresh.proposerCashUsd,
    recipientCashUsd: fresh.recipientCashUsd,
  });
  const viewerIsCashPayer = Boolean(cashSides && cashSides.payerUserId === session.user.id);
  const cashPayeeUsername =
    cashSides?.payeeUserId === fresh.proposerId
      ? fresh.proposer.username
      : cashSides?.payeeUserId === fresh.recipientId
        ? fresh.recipient.username
        : null;

  const viewerLabelUrl = viewerIsProposer ? fresh.proposerLabelUrl : fresh.recipientLabelUrl;
  const viewerTrackingNumber = viewerIsProposer
    ? fresh.proposerTrackingNumber
    : fresh.recipientTrackingNumber;
  const viewerLabelReady = Boolean(
    viewerIsProposer
      ? fresh.proposerLabelPurchasedAt || fresh.proposerLabelUrl
      : fresh.recipientLabelPurchasedAt || fresh.recipientLabelUrl,
  );
  const viewerShippedAt = viewerIsProposer ? fresh.proposerShippedAt : fresh.recipientShippedAt;
  const viewerReceivedAt = viewerIsProposer ? fresh.proposerReceivedAt : fresh.recipientReceivedAt;
  const partnerShippedAt = viewerIsProposer ? fresh.recipientShippedAt : fresh.proposerShippedAt;
  const partnerReceivedAt = viewerIsProposer ? fresh.recipientReceivedAt : fresh.proposerReceivedAt;
  const partnerTrackingNumber = viewerIsProposer
    ? fresh.recipientTrackingNumber
    : fresh.proposerTrackingNumber;
  const partnerTrackingUrl = viewerIsProposer ? fresh.recipientTrackingUrl : fresh.proposerTrackingUrl;
  const requiresDeposit = tradeRequiresSecurityDeposit(fresh);
  const depositAmountUsd = resolveTradeSecurityDepositUsd({
    proposerCashUsd: fresh.proposerCashUsd,
    recipientCashUsd: fresh.recipientCashUsd,
    proposerItemsValueUsd: offeredValue,
    recipientItemsValueUsd: requestedValue,
    securityDepositCents: fresh.securityDepositCents,
  });
  const viewerDepositPaid = viewerIsProposer
    ? Boolean(fresh.proposerDepositPaidAt)
    : Boolean(fresh.recipientDepositPaidAt);
  const partnerDepositPaid = viewerIsProposer
    ? Boolean(fresh.recipientDepositPaidAt)
    : Boolean(fresh.proposerDepositPaidAt);

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
          <p className="mt-1 text-xs text-zinc-500">{TRADE_HUB_ALIGNED_NOTE}</p>
          {fresh.expiresAt ? (
            <p className="mt-1 text-xs text-zinc-500">Expires {new Date(fresh.expiresAt).toLocaleString()}</p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href="/trade/new"
              className="rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-zinc-200 hover:border-gold/35 hover:text-gold-bright"
            >
              Start another trade
            </Link>
            <Link
              href="/trade/offers"
              className="rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-zinc-200 hover:border-white/25"
            >
              Back to offers
            </Link>
          </div>
        </header>

        {feeFlash === "paid" ? (
          <p className="mt-4 rounded-xl border border-emerald-300/25 bg-emerald-950/20 px-4 py-3 text-sm font-medium text-emerald-100">
            Platform fee payment received. Thank you.
          </p>
        ) : null}
        {feeFlash === "cancelled" ? (
          <p className="mt-4 rounded-xl border border-amber-300/25 bg-amber-950/20 px-4 py-3 text-sm font-medium text-amber-100">
            Checkout cancelled — you can pay the platform fee anytime from this page.
          </p>
        ) : null}
        {cashFlash === "paid" ? (
          <p className="mt-4 rounded-xl border border-emerald-300/25 bg-emerald-950/20 px-4 py-3 text-sm font-medium text-emerald-100">
            Trade cash payment received. Thank you.
          </p>
        ) : null}
        {cashFlash === "cancelled" ? (
          <p className="mt-4 rounded-xl border border-amber-300/25 bg-amber-950/20 px-4 py-3 text-sm font-medium text-amber-100">
            Cash checkout cancelled — you can pay anytime from this page.
          </p>
        ) : null}
        {depositFlash === "paid" ? (
          <p className="mt-4 rounded-xl border border-emerald-300/25 bg-emerald-950/20 px-4 py-3 text-sm font-medium text-emerald-100">
            Security deposit received. It will be refunded when both of you confirm receipt.
          </p>
        ) : null}
        {depositFlash === "cancelled" ? (
          <p className="mt-4 rounded-xl border border-amber-300/25 bg-amber-950/20 px-4 py-3 text-sm font-medium text-amber-100">
            Deposit checkout cancelled — you can pay anytime from this page.
          </p>
        ) : null}
        {fresh.status === "disputed" ? (
          <p className="mt-4 rounded-xl border border-rose-300/25 bg-rose-950/20 px-4 py-3 text-sm font-medium text-rose-100">
            Dispute open{fresh.disputeReason ? `: ${fresh.disputeReason}` : "."} Shipping confirmations and cash
            release are paused until Get Vaulted resolves it.
          </p>
        ) : null}

        {cashTotal > 0 && (fresh.status === "accepted" || fresh.status === "completed" || fresh.status === "disputed") ? (
          <p className="mt-4 rounded-xl border border-white/[0.08] bg-[#09090c]/85 px-4 py-3 text-sm text-zinc-300">
            Trade cash ({formatMoney(cashTotal)}):{" "}
            {!fresh.cashPaidAt
              ? "not paid yet"
              : fresh.cashRefundedAt
                ? "refunded to payer"
                : fresh.cashReleasedAt
                  ? "released to payee"
                  : isTradeCashHeld(fresh)
                    ? "held by Get Vaulted until both confirm receipt"
                    : "recorded"}
            {fresh.cashReleaseError ? (
              <span className="mt-1 block text-xs text-amber-200/90">{fresh.cashReleaseError}</span>
            ) : null}
          </p>
        ) : null}

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
        {fresh.status === "accepted" || fresh.status === "completed" || fresh.status === "disputed" ? (
          <section className="mt-4 rounded-2xl border border-gold/25 bg-[#0a0a0d]/90 p-4">
            <p className="text-sm font-semibold text-gold-bright">After accept — costs</p>
            <p className="mt-2 text-xs leading-relaxed text-zinc-400">{TRADE_AFTER_ACCEPT_NOTE}</p>
            <ul className="mt-2 space-y-1.5 text-xs text-zinc-400">
              <li>
                One Stripe charge per party: ${GET_VAULTED_TRADE_PLATFORM_FEE_USD.toFixed(2)} Get Vaulted fee + your
                outbound Shippo label
                {partnerFeePaid ? " · partner paid" : " · waiting on partner"}
              </li>
              {cashTotal > 0 ? (
                <li>
                  Cash on this trade: {formatMoney(cashTotal)}.
                  {fresh.cashPaidAt
                    ? fresh.cashReleasedAt
                      ? " Paid and released to payee."
                      : fresh.cashRefundedAt
                        ? " Paid then refunded."
                        : " Paid — held by Get Vaulted until both confirm receipt."
                    : ` ${TRADE_CASH_SETTLEMENT_NOTE}`}
                </li>
              ) : (
                <li>
                  Straight trade (no cash) — each side pays a {formatMoney(depositAmountUsd)} refundable
                  security deposit (25% of higher-side value, $100–$500)
                  {requiresDeposit
                    ? viewerDepositPaid
                      ? partnerDepositPaid
                        ? " · both deposits paid"
                        : " · waiting on partner deposit"
                      : " · your deposit due before mark shipped"
                    : ""}
                  .
                </li>
              )}
            </ul>
            {isParticipant && fresh.status !== "disputed" ? (
              <div className="mt-4 space-y-3">
                <TradePlatformFeePayButton offerId={fresh.id} alreadyPaid={viewerFeePaid} />
                {requiresDeposit ? (
                  <TradeDepositPayButton
                    offerId={fresh.id}
                    amountUsd={depositAmountUsd}
                    alreadyPaid={viewerDepositPaid}
                  />
                ) : null}
                {viewerIsCashPayer && cashSides ? (
                  <TradeCashPayButton
                    offerId={fresh.id}
                    amountUsd={cashSides.amountUsd}
                    payeeUsername={cashPayeeUsername}
                    alreadyPaid={Boolean(fresh.cashPaidAt)}
                  />
                ) : null}
                <p className="text-[11px] text-zinc-500">{TRADE_FULFILLMENT_NOTE}</p>
                <TradeFulfillmentActions
                  offerId={fresh.id}
                  canMarkShipped={
                    viewerLabelReady &&
                    !viewerShippedAt &&
                    (!requiresDeposit || viewerDepositPaid)
                  }
                  alreadyShipped={Boolean(viewerShippedAt)}
                  canConfirmReceived={Boolean(partnerShippedAt) && !viewerReceivedAt}
                  alreadyReceived={Boolean(viewerReceivedAt)}
                  completed={fresh.status === "completed"}
                  viewerLabelUrl={viewerLabelUrl}
                  viewerTrackingNumber={viewerTrackingNumber}
                  partnerTrackingNumber={partnerTrackingNumber}
                  partnerTrackingUrl={partnerTrackingUrl}
                  partnerShipped={Boolean(partnerShippedAt)}
                  partnerReceived={Boolean(partnerReceivedAt)}
                />
              </div>
            ) : null}
            {isParticipant && fresh.status === "accepted" ? (
              <div className="mt-4">
                <TradeDisputeButton offerId={fresh.id} />
              </div>
            ) : null}
          </section>
        ) : null}
        {isAdmin ? <TradeAdminEscrowActions offerId={fresh.id} /> : null}
        <section className="mt-4 rounded-2xl border border-white/[0.08] bg-[#09090c]/85 p-4">
          <p className="text-sm font-semibold text-zinc-100">Trade chat</p>
          <p className="mt-1 text-xs text-zinc-500">
            Message your counterparty about shipping and handoff. The offer timeline and status on this page stay
            authoritative for items, cash, and acceptance — chat never changes the deal terms.
          </p>
          {isParticipant ? (
            <div className="mt-3">
              <TradeOfferConversationButton offerId={fresh.id} conversationId={fresh.conversationId} />
            </div>
          ) : null}
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
