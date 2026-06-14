import Link from "next/link";
import { redirect } from "next/navigation";
import { authOptions, getServerSessionSafe } from "@/lib/auth";
import { buildBuyerOrderTimeline, buildSellerOrderMilestones } from "@/lib/order-timeline";
import { OrderEscrowBuyerPanel } from "@/components/orders/OrderEscrowBuyerPanel";
import { OrderPaySection } from "@/components/orders/OrderPaySection";
import { OrderReportLink } from "@/components/orders/OrderReportLink";
import { PaymentDeadlineCountdown } from "@/components/orders/PaymentDeadlineCountdown";
import { OrderTimelineSteps, SellerMilestoneSteps } from "@/components/orders/OrderTimeline";
import { orderStatusLabel } from "@/lib/order-status";
import { prisma } from "@/lib/prisma";
import { isEscrowConfigured, orderTotalQualifiesForEscrow } from "@/lib/escrow-config";
import { isStripePaymentMethodId } from "@/lib/stripe-payment-method-id";
import { orderRequiresCheckoutForTax } from "@/lib/stripe-tax";
import { processAuctionPaymentExpiries, reconcileOrderCheckoutSession } from "@/services/payments";

export const dynamic = "force-dynamic";

function formatMoney(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

function paymentStatusLabel(s: string): string {
  if (s === "pending_payment") return "Pending payment";
  if (s === "payment_requires_action") return "Authentication required";
  if (s === "paid") return "Paid";
  if (s === "failed") return "Failed";
  if (s === "expired") return "Payment expired";
  if (s === "refunded") return "Refunded";
  return s;
}

export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getServerSessionSafe();
  const { orderId: raw } = await params;
  const orderId = decodeURIComponent(raw);
  const sp = (await searchParams) ?? {};
  const sessionIdRaw = sp.session_id;
  const checkoutSessionId =
    typeof sessionIdRaw === "string" ? sessionIdRaw : Array.isArray(sessionIdRaw) ? sessionIdRaw[0] : "";

  if (!session?.user?.id) {
    redirect(`/signin?returnTo=${encodeURIComponent(`/orders/${encodeURIComponent(orderId)}`)}`);
  }

  if (checkoutSessionId.trim()) {
    const { confirmMarketplaceCheckoutSessionFromRedirect } = await import("@/services/payments");
    try {
      await confirmMarketplaceCheckoutSessionFromRedirect(checkoutSessionId.trim(), session.user.id);
    } catch (e) {
      console.error("[orders/[orderId]] confirm checkout session", e);
    }
  } else {
    try {
      await reconcileOrderCheckoutSession(orderId, session.user.id);
    } catch (e) {
      console.error("[orders/[orderId]] reconcile checkout session", e);
    }
  }

  try {
    await processAuctionPaymentExpiries();
  } catch (e) {
    console.error("[orders/[orderId]] processAuctionPaymentExpiries", e);
  }

  const order = await prisma.order.findFirst({
    where: {
      id: orderId,
      OR: [{ buyerId: session.user.id }, { sellerId: session.user.id }],
    },
    select: {
      id: true,
      buyerId: true,
      sellerId: true,
      status: true,
      paymentStatus: true,
      fulfillmentStatus: true,
      itemPriceUsd: true,
      shippingPriceUsd: true,
      totalUsd: true,
      trackingNumber: true,
      labelUrl: true,
      shippoTransactionId: true,
      shippedAt: true,
      shipRecipientName: true,
      shipAddress: true,
      shipCity: true,
      shipState: true,
      shipZip: true,
      shipCountry: true,
      paymentDeadlineAt: true,
      paymentLabel: true,
      paymentMethod: true,
      escrowStatus: true,
      listing: { select: { id: true, title: true, status: true, buyingFormat: true } },
    },
  });

  const sellerCommerceEventsAsc =
    order && order.sellerId === session.user.id
      ? await prisma.sellerCommerceEvent.findMany({
          where: {
            sellerId: session.user.id,
            OR: [{ listingId: order.listing.id }, { orderId: order.id }],
          },
          orderBy: { createdAt: "asc" },
          take: 40,
          select: { id: true, title: true, body: true, createdAt: true },
        })
      : [];

  if (!order) {
    return (
      <main className="relative flex min-h-0 flex-1 flex-col bg-[linear-gradient(180deg,rgba(14,14,18,0.55)_0%,#030303_38%,#030303_100%)]">
        <div className="mx-auto max-w-lg px-4 py-24 text-center">
          <p className="font-display text-xl font-bold text-foreground">Order not found</p>
          <p className="mt-2 text-sm text-zinc-500">This order may have been removed or you don&apos;t have access.</p>
          <Link
            href="/account/orders"
            className="mt-6 inline-flex h-11 items-center justify-center rounded-full border border-gold/35 px-6 text-sm font-semibold text-gold-bright transition hover:bg-gold/10"
          >
            View your orders
          </Link>
          <Link href="/marketplace" className="mt-3 block text-sm font-semibold text-zinc-400 hover:text-zinc-200">
            ← Marketplace
          </Link>
        </div>
      </main>
    );
  }

  const savedCardPayEligibleBase =
    order.listing.buyingFormat === "auction" &&
    isStripePaymentMethodId(order.paymentLabel ?? "") &&
    !(orderTotalQualifiesForEscrow(order.totalUsd) && isEscrowConfigured());

  const checkoutRequiredForTax = await orderRequiresCheckoutForTax(order.shipState, order.shipCountry);
  const savedCardPayEligible = savedCardPayEligibleBase && !checkoutRequiredForTax;

  const isBuyer = order.buyerId === session.user.id;

  const buyerSteps = buildBuyerOrderTimeline({
    listingBuyingFormat: order.listing.buyingFormat,
    paymentStatus: order.paymentStatus,
    orderStatus: order.status,
    fulfillmentStatus: order.fulfillmentStatus,
    trackingNumber: order.trackingNumber,
    labelUrl: order.labelUrl,
    shippoTransactionId: order.shippoTransactionId,
  });

  const sellerMilestones = buildSellerOrderMilestones({
    paymentStatus: order.paymentStatus,
    fulfillmentStatus: order.fulfillmentStatus,
    orderStatus: order.status,
    trackingNumber: order.trackingNumber,
    labelUrl: order.labelUrl,
    shippoTransactionId: order.shippoTransactionId,
  });

  return (
    <main className="relative flex min-h-0 flex-1 flex-col bg-[linear-gradient(180deg,rgba(14,14,18,0.55)_0%,#030303_38%,#030303_100%)]">
      <div className="relative mx-auto w-full max-w-[1920px] px-4 py-10 sm:px-6 sm:py-14 lg:px-10">
        <Link href="/marketplace" className="text-[11px] font-semibold uppercase tracking-wider text-gold-bright/90 hover:text-gold-bright">
          ← Marketplace
        </Link>
        <h1 className="font-display mt-6 text-2xl font-bold text-foreground">Order</h1>
        <p className="mt-1 font-mono text-xs text-zinc-500">{order.id}</p>

        {isBuyer ? (
          <div className="mt-8">
            <OrderTimelineSteps steps={buyerSteps} heading="Your progress" />
          </div>
        ) : (
          <div className="mt-8">
            <SellerMilestoneSteps milestones={sellerMilestones} heading="Fulfillment checklist" />
          </div>
        )}

        <div className="mt-8 space-y-4 rounded-2xl border border-white/[0.08] bg-[#0a0a0d] p-6">
          <div className="flex flex-wrap justify-between gap-2 text-sm">
            <span className="text-zinc-500">Role</span>
            <span className="font-medium text-zinc-200">{isBuyer ? "Buyer" : "Seller"}</span>
          </div>
          <div className="flex flex-wrap justify-between gap-2 text-sm">
            <span className="text-zinc-500">Status</span>
            <span className="font-medium text-zinc-200">{orderStatusLabel(order.status)}</span>
          </div>
          <div className="flex flex-wrap justify-between gap-2 text-sm">
            <span className="text-zinc-500">Payment</span>
            <span className="font-medium text-zinc-200">{paymentStatusLabel(order.paymentStatus)}</span>
          </div>
          <div className="flex flex-wrap justify-between gap-2 text-sm">
            <span className="text-zinc-500">Fulfillment</span>
            <span className="font-medium text-zinc-200">{order.fulfillmentStatus}</span>
          </div>
          {order.paymentMethod === "escrow" ? (
            <>
              <div className="flex flex-wrap justify-between gap-2 text-sm">
                <span className="text-zinc-500">Payment path</span>
                <span className="font-medium text-zinc-200">Secure processing</span>
              </div>
              {order.escrowStatus ? (
                <div className="flex flex-wrap justify-between gap-2 text-sm">
                  <span className="text-zinc-500">Processing status</span>
                  <span className="max-w-[min(20rem,65%)] text-right font-mono text-xs text-zinc-200">
                    {order.escrowStatus.replace(/_/g, " ")}
                  </span>
                </div>
              ) : null}
            </>
          ) : null}
          {order.trackingNumber ? (
            <div className="flex flex-wrap justify-between gap-2 text-sm">
              <span className="text-zinc-500">Tracking</span>
              <span className="max-w-[min(20rem,65%)] text-right font-mono text-xs text-zinc-200">{order.trackingNumber}</span>
            </div>
          ) : null}
          {order.shippedAt ? (
            <div className="flex flex-wrap justify-between gap-2 text-sm">
              <span className="text-zinc-500">Shipped</span>
              <span className="font-mono text-xs text-zinc-400">
                {new Date(order.shippedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
              </span>
            </div>
          ) : null}
          <div className="flex flex-wrap justify-between gap-2 text-sm">
            <span className="text-zinc-500">Listing</span>
            <span className="max-w-[min(20rem,65%)] text-right font-medium text-zinc-200">{order.listing.title}</span>
          </div>
          <div className="flex flex-wrap justify-between gap-2 text-sm">
            <span className="text-zinc-500">Item price</span>
            <span className="font-mono text-zinc-200">{formatMoney(order.itemPriceUsd)}</span>
          </div>
          <div className="flex flex-wrap justify-between gap-2 text-sm">
            <span className="text-zinc-500">Shipping</span>
            <span className="font-mono text-zinc-200">{formatMoney(order.shippingPriceUsd)}</span>
          </div>
          <div className="flex flex-wrap justify-between gap-2 border-t border-white/[0.06] pt-4 text-sm">
            <span className="font-semibold text-zinc-300">Total</span>
            <span className="font-mono font-bold text-gold-bright">{formatMoney(order.totalUsd)}</span>
          </div>
        </div>

        {!isBuyer &&
        order.listing.status === "awaiting_auction_payment" &&
        (order.paymentStatus === "pending_payment" || order.paymentStatus === "payment_requires_action") &&
        order.paymentDeadlineAt ? (
          <div className="mt-6 rounded-2xl border border-amber-500/20 bg-amber-950/15 p-6">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-200/90">Auction ended — payment pending</p>
            <p className="mt-2 text-sm text-zinc-300">Winner has 30 minutes to pay.</p>
            <p className="mt-2 text-xs text-zinc-400">
              Time remaining:{" "}
              <PaymentDeadlineCountdown deadlineIso={order.paymentDeadlineAt.toISOString()} />
            </p>
          </div>
        ) : null}

        {isBuyer ? (
          <div className="mt-6 rounded-2xl border border-white/[0.08] bg-[#0a0a0d] p-6">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Ship to</p>
            <p className="mt-3 text-sm text-zinc-200">
              {order.shipRecipientName}
              <br />
              {order.shipAddress}
              <br />
              {order.shipCity}, {order.shipState} {order.shipZip}
              <br />
              {order.shipCountry}
            </p>
          </div>
        ) : null}

        <OrderPaySection
          orderId={order.id}
          paymentStatus={order.paymentStatus}
          isBuyer={isBuyer}
          paymentDeadlineAt={order.paymentDeadlineAt?.toISOString() ?? null}
          listingBuyingFormat={order.listing.buyingFormat}
          totalUsd={order.totalUsd}
          savedCardPayEligible={savedCardPayEligible}
          checkoutRequiredForTax={checkoutRequiredForTax}
        />

        {isBuyer && order.paymentMethod === "escrow" ? (
          <OrderEscrowBuyerPanel
            orderId={order.id}
            paymentStatus={order.paymentStatus}
            escrowStatus={order.escrowStatus}
          />
        ) : null}

        {!isBuyer && sellerCommerceEventsAsc.length > 0 ? (
          <div className="mt-8 rounded-2xl border border-white/[0.08] bg-[#0a0a0d] p-6">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Activity log</p>
            <p className="mt-1 text-xs text-zinc-600">Timeline of marketplace events for this listing and order.</p>
            <ul className="mt-4 divide-y divide-white/[0.06]">
              {sellerCommerceEventsAsc.map((ev) => (
                <li key={ev.id} className="py-3 first:pt-0">
                  <p className="text-sm font-semibold text-zinc-200">{ev.title}</p>
                  <p className="mt-1 text-xs text-zinc-400">{ev.body}</p>
                  <p className="mt-1 font-mono text-[10px] text-zinc-600">
                    {ev.createdAt.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-8 flex flex-wrap gap-3 text-[11px] font-semibold uppercase tracking-wide">
          {isBuyer ? (
            <>
              <OrderReportLink orderId={order.id} />
              <span className="text-zinc-700">·</span>
            </>
          ) : null}
          <Link href="/account/orders" className="text-gold-bright/90 hover:text-gold-bright">
            Your orders
          </Link>
          <span className="text-zinc-700">·</span>
          <Link href="/account/sales" className="text-gold-bright/90 hover:text-gold-bright">
            Your sales
          </Link>
          <span className="text-zinc-700">·</span>
          <Link href="/account/notifications" className="text-gold-bright/90 hover:text-gold-bright">
            Notifications
          </Link>
        </div>
      </div>
    </main>
  );
}
