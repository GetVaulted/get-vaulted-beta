import Link from "next/link";
import { redirect } from "next/navigation";
import { BuyNowCheckoutForm, type CheckoutListingSnapshot } from "@/components/checkout/BuyNowCheckoutForm";
import { LayawayCheckoutForm } from "@/components/checkout/LayawayCheckoutForm";
import { listingSupportsLayawayCheckout } from "@/lib/layaway/eligibility";
import { authOptions, getServerSessionSafe } from "@/lib/auth";
import { isHiddenFixtureSellerEmail } from "@/lib/demo-seed-sellers";
import { prisma } from "@/lib/prisma";
import { safeCuidParam } from "@/lib/safe-return-to";
import { formatShipsFromRegion } from "@/lib/seller-shipping-readiness";

export const dynamic = "force-dynamic";

export default async function CheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ listingId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getServerSessionSafe();
  const { listingId: raw } = await params;
  const listingId = decodeURIComponent(raw);
  const sp = (await searchParams) ?? {};
  const liveItemRaw = sp.liveItem;
  const returnLiveRaw = sp.returnLive;
  const liveRoomItemIdRaw =
    typeof liveItemRaw === "string" ? liveItemRaw : Array.isArray(liveItemRaw) ? liveItemRaw[0] : "";
  const returnLiveRoomIdRaw =
    typeof returnLiveRaw === "string" ? returnLiveRaw : Array.isArray(returnLiveRaw) ? returnLiveRaw[0] : "";
  const liveRoomItemId = safeCuidParam(liveRoomItemIdRaw);
  const returnLiveRoomId = safeCuidParam(returnLiveRoomIdRaw);
  const modeRaw = sp.mode;
  const checkoutMode =
    (typeof modeRaw === "string" ? modeRaw : Array.isArray(modeRaw) ? modeRaw[0] : "") === "layaway"
      ? "layaway"
      : "buy_now";
  const qs = new URLSearchParams();
  if (liveRoomItemId) qs.set("liveItem", liveRoomItemId);
  if (returnLiveRoomId) qs.set("returnLive", returnLiveRoomId);
  const checkoutSuffix = qs.toString() ? `?${qs.toString()}` : "";

  if (!session?.user?.id) {
    redirect(`/signin?returnTo=${encodeURIComponent(`/checkout/${encodeURIComponent(listingId)}${checkoutSuffix}`)}`);
  }

  const row = await prisma.listing.findUnique({
    where: { id: listingId },
    include: {
      images: { orderBy: { sortOrder: "asc" }, take: 1 },
      seller: { select: { email: true } },
    },
  });

  const layawayEligible =
    row != null &&
    listingSupportsLayawayCheckout({
      buyingFormat: row.buyingFormat,
      status: row.status,
      allowLayaway: row.allowLayaway,
      priceUsd: row.priceUsd,
      moderationRemovedAt: row.moderationRemovedAt,
    });

  const sellerShip = row
    ? await prisma.user.findUnique({
        where: { id: row.sellerId },
        select: { shipFromState: true, shipFromCountry: true },
      })
    : null;

  if (!row) {
    return (
      <main className="relative flex min-h-0 flex-1 flex-col bg-[linear-gradient(180deg,rgba(14,14,18,0.55)_0%,#030303_38%,#030303_100%)]">
        <div className="mx-auto max-w-lg px-4 py-24 text-center">
          <p className="font-display text-xl font-bold text-foreground">Listing not found</p>
          <Link href="/marketplace" className="mt-6 inline-block text-sm font-semibold text-gold-bright hover:underline">
            ← Back to marketplace
          </Link>
        </div>
      </main>
    );
  }

  if (isHiddenFixtureSellerEmail(row.seller.email)) {
    return (
      <main className="relative flex min-h-0 flex-1 flex-col bg-[linear-gradient(180deg,rgba(14,14,18,0.55)_0%,#030303_38%,#030303_100%)]">
        <div className="mx-auto max-w-lg px-4 py-24 text-center">
          <p className="font-display text-xl font-bold text-foreground">Listing not found</p>
          <Link href="/marketplace" className="mt-6 inline-block text-sm font-semibold text-gold-bright hover:underline">
            ← Back to marketplace
          </Link>
        </div>
      </main>
    );
  }

  if (row.buyingFormat !== "buy_now" || row.status !== "active" || row.moderationRemovedAt) {
    return (
      <main className="relative flex min-h-0 flex-1 flex-col bg-[linear-gradient(180deg,rgba(14,14,18,0.55)_0%,#030303_38%,#030303_100%)]">
        <div className="mx-auto max-w-lg px-4 py-24 text-center">
          <p className="font-display text-xl font-bold text-foreground">Not available for checkout</p>
          <p className="mt-2 text-sm text-zinc-500">This item is not an active buy-now listing.</p>
          <Link href={`/marketplace/${encodeURIComponent(listingId)}`} className="mt-6 inline-block text-sm font-semibold text-gold-bright hover:underline">
            ← Back to listing
          </Link>
        </div>
      </main>
    );
  }

  if (row.sellerId === session.user.id) {
    return (
      <main className="relative flex min-h-0 flex-1 flex-col bg-[linear-gradient(180deg,rgba(14,14,18,0.55)_0%,#030303_38%,#030303_100%)]">
        <div className="mx-auto max-w-lg px-4 py-24 text-center">
          <p className="font-display text-xl font-bold text-foreground">This is your listing</p>
          <p className="mt-2 text-sm text-zinc-500">You cannot purchase your own item.</p>
          <Link href={`/marketplace/${encodeURIComponent(listingId)}`} className="mt-6 inline-block text-sm font-semibold text-gold-bright hover:underline">
            ← Back to listing
          </Link>
        </div>
      </main>
    );
  }

  const trackingAfterPurchaseLine =
    "After your payment clears, the seller purchases a carrier label and tracking is added to your order when available.";

  const snapshot: CheckoutListingSnapshot = {
    id: row.id,
    title: row.title,
    imageUrl: row.images[0]?.url ?? null,
    itemPriceUsd: row.priceUsd,
    shippingPriceUsd: row.shippingPriceUsd,
    handlingEstimate: row.handlingTime?.trim() || "Typically ships within 1–2 business days",
    shipsFromRegion: formatShipsFromRegion(sellerShip?.shipFromState, sellerShip?.shipFromCountry),
    trackingAfterPurchaseLine,
  };

  return (
    <main className="relative flex min-h-0 flex-1 flex-col bg-[linear-gradient(180deg,rgba(14,14,18,0.55)_0%,#030303_38%,#030303_100%)]">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[min(380px,50vh)] bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(201,162,39,0.08),transparent_55%)]"
        aria-hidden
      />
      <div className="relative mx-auto w-full max-w-[1920px] px-3 pb-20 pt-6 sm:px-4 lg:px-10">
        <Link
          href={`/marketplace/${encodeURIComponent(listingId)}`}
          className="inline-flex text-[11px] font-semibold uppercase tracking-wider text-gold-bright/90 hover:text-gold-bright"
        >
          ← Back to item
        </Link>
        <header className="mt-4 border-b border-white/[0.07] pb-6">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Checkout</p>
          <h1 className="font-display mt-2 text-2xl font-black tracking-tight text-foreground sm:text-3xl">
            {checkoutMode === "layaway" ? "Layaway checkout" : "Buy now"}
          </h1>
          <p className="mt-1.5 text-sm text-zinc-500">
            {checkoutMode === "layaway"
              ? "Choose your plan, acknowledge terms, and pay your 25% deposit."
              : "Review your order and enter shipping details."}
          </p>
        </header>
        <div className="mt-8">
          {checkoutMode === "layaway" ? (
            layawayEligible ? (
              <LayawayCheckoutForm listing={snapshot} />
            ) : (
              <p className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-6 text-sm text-zinc-400">
                Layaway is not available for this listing.{" "}
                <Link href={`/checkout/${encodeURIComponent(listingId)}`} className="font-semibold text-gold-bright hover:underline">
                  Buy now instead
                </Link>
              </p>
            )
          ) : (
            <BuyNowCheckoutForm
              listing={snapshot}
              liveRoomItemId={liveRoomItemId || null}
              returnLiveRoomId={returnLiveRoomId || null}
            />
          )}
        </div>
        {checkoutMode === "buy_now" && layawayEligible ? (
          <p className="mt-6 text-center text-sm text-zinc-500">
            Prefer to pay over time?{" "}
            <Link
              href={`/checkout/${encodeURIComponent(listingId)}?mode=layaway`}
              className="font-semibold text-gold-bright hover:underline"
            >
              Start layaway
            </Link>
          </p>
        ) : null}
      </div>
    </main>
  );
}
