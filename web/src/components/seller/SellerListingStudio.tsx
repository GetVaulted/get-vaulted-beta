"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SellerOffersModal } from "@/components/account/SellerOffersModal";
import { ExpiredAuctionRecoveryPanel } from "@/components/listings/ExpiredAuctionRecoveryPanel";
import { PaymentDeadlineCountdown } from "@/components/orders/PaymentDeadlineCountdown";
import {
  effectiveSellerListingStatus,
  type SellerListingStatus,
  type StoredUserListing,
} from "@/lib/user-listings-storage";
import { publicListingHref } from "@/lib/listing-routes";
import { WATCHLIST_TOAST_EVENT } from "@/lib/watchlist-events";

type EndRequest = {
  id: string;
  status: string;
  adminNote?: string | null;
};

function toast(message: string) {
  window.dispatchEvent(new CustomEvent(WATCHLIST_TOAST_EVENT, { detail: { message } }));
}

function statusLabel(st: SellerListingStatus): string {
  if (st === "ended") return "Ended";
  if (st === "auction_live") return "Auction live";
  if (st === "awaiting_auction_payment") return "Payment pending";
  if (st === "auction_ended_unpaid") return "Payment expired";
  return st.charAt(0).toUpperCase() + st.slice(1);
}

function statusTone(st: SellerListingStatus): string {
  if (st === "active") return "border-emerald-400/25 bg-emerald-500/10 text-emerald-200/95";
  if (st === "draft") return "border-zinc-500/25 bg-zinc-800/40 text-zinc-300";
  if (st === "ended") return "border-zinc-500/25 bg-zinc-900/50 text-zinc-400";
  if (st === "sold") return "border-rose-400/25 bg-rose-950/35 text-rose-100/90";
  return "border-amber-400/25 bg-amber-950/30 text-amber-100/90";
}

function notifyListingsUpdated() {
  window.dispatchEvent(new Event("gv-listings-updated"));
}

type LiveRoomRow = { id: string; title: string; status: string; roomType: string };

export function SellerListingStudio({ listingId }: { listingId: string }) {
  const router = useRouter();
  const [listing, setListing] = useState<StoredUserListing | null>(null);
  const [bidCount, setBidCount] = useState(0);
  const [endRequest, setEndRequest] = useState<EndRequest | null>(null);
  const [liveRooms, setLiveRooms] = useState<LiveRoomRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [offersOpen, setOffersOpen] = useState(false);

  const [priceUsd, setPriceUsd] = useState("");
  const [shippingUsd, setShippingUsd] = useState("");
  const [handlingTime, setHandlingTime] = useState("");

  const reload = useCallback(async () => {
    setError(null);
    const res = await fetch(`/api/listings/${encodeURIComponent(listingId)}`, { cache: "no-store" });
    if (!res.ok) {
      setError(res.status === 404 ? "Listing not found." : "Could not load listing.");
      setListing(null);
      setLoading(false);
      return;
    }
    const data = (await res.json()) as {
      stored?: StoredUserListing | null;
      bidCount?: number;
      endRequest?: EndRequest | null;
    };
    const row = data.stored ?? null;
    if (!row) {
      setError("You do not have access to manage this listing.");
      setListing(null);
      setLoading(false);
      return;
    }
    setListing(row);
    setBidCount(data.bidCount ?? row.auctionBidCount ?? 0);
    setEndRequest(data.endRequest ?? null);
    setPriceUsd(String(row.buyingFormat === "auction" ? (row.displayBid ?? row.startingBid ?? row.price) : row.price));
    setShippingUsd(String(row.shippingPriceUsd ?? 0));
    setHandlingTime(row.handlingTime ?? "1–3 business days");
    setLoading(false);
  }, [listingId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/live-rooms?mine=1&limit=12", { cache: "no-store" });
      if (!res.ok) return;
      const j = (await res.json()) as { rooms?: { id: string; title: string; status: string; roomType: string }[] };
      setLiveRooms(
        (Array.isArray(j.rooms) ? j.rooms : []).map((r) => ({
          id: r.id,
          title: r.title,
          status: r.status,
          roomType: r.roomType,
        })),
      );
    })();
  }, []);

  const status = listing ? effectiveSellerListingStatus(listing) : null;
  const publicHref = publicListingHref(listingId);
  const thumb = listing?.imageDataUrls[0];

  const patchListing = useCallback(
    async (body: Record<string, unknown>) => {
      setBusy(true);
      try {
        const res = await fetch(`/api/listings/${encodeURIComponent(listingId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(j?.error ?? "Update failed.");
        }
        await reload();
        notifyListingsUpdated();
        router.refresh();
        toast("Listing updated.");
      } catch (e) {
        toast(e instanceof Error ? e.message : "Update failed.");
      } finally {
        setBusy(false);
      }
    },
    [listingId, reload, router],
  );

  const savePricing = () => {
    const n = Number(priceUsd);
    if (!Number.isFinite(n) || n <= 0) {
      toast("Enter a valid price.");
      return;
    }
    if (listing?.buyingFormat === "auction" && bidCount > 0) {
      toast("Cannot change starting bid after bids have been placed.");
      return;
    }
    if (listing?.buyingFormat === "auction") {
      void patchListing({ startingBidUsd: n });
    } else {
      void patchListing({ priceUsd: n });
    }
  };

  const saveShipping = () => {
    const ship = Number(shippingUsd);
    if (!Number.isFinite(ship) || ship < 0) {
      toast("Enter a valid shipping price.");
      return;
    }
    void patchListing({ shippingPriceUsd: ship, handlingTime: handlingTime.trim() || "1–3 business days" });
  };

  const copyPublicLink = async () => {
    const url = typeof window !== "undefined" ? `${window.location.origin}${publicHref}` : publicHref;
    try {
      await navigator.clipboard.writeText(url);
      toast("Buyer link copied.");
    } catch {
      toast("Could not copy link.");
    }
  };

  const metrics = useMemo(() => {
    if (!listing) return [];
    return [
      { label: "Views", value: listing.views ?? "—" },
      { label: "Watchers", value: listing.watchers ?? "—" },
      { label: "Offers", value: listing.pendingOffersCount ?? 0 },
      { label: "Bids", value: listing.buyingFormat === "auction" ? bidCount : "—" },
    ];
  }, [bidCount, listing]);

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 text-center text-sm text-zinc-500">Loading Seller Studio…</div>
    );
  }

  if (error || !listing || !status) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center">
        <p className="font-display text-xl font-bold text-foreground">{error ?? "Listing unavailable"}</p>
        <Link href="/seller/listings" className="mt-6 inline-block text-sm font-semibold text-gold-bright hover:underline">
          ← Back to listings
        </Link>
      </div>
    );
  }

  const canPause =
    status === "active" || status === "auction_live";
  const canMarkSold = status !== "sold" && status !== "draft" && status !== "ended";
  const showRecovery = status === "auction_ended_unpaid";
  const offers = listing.pendingOffersCount ?? 0;

  return (
    <div className="relative min-h-full bg-[linear-gradient(180deg,rgba(14,14,18,0.55)_0%,#030303_38%,#030303_100%)]">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(201,162,39,0.08),transparent_60%)]"
        aria-hidden
      />

      <header className="sticky top-0 z-30 border-b border-white/[0.08] bg-[#050507]/92 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-3 py-3 sm:px-4">
          <Link
            href="/seller/listings"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/12 text-zinc-400 transition hover:border-gold/35 hover:text-gold-bright"
            aria-label="Back to listings"
          >
            ←
          </Link>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gold-bright/80">Vault Seller Studio</p>
            <h1 className="truncate font-display text-base font-bold text-foreground sm:text-lg">{listing.title}</h1>
          </div>
          <span className={`hidden shrink-0 rounded-md border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide sm:inline-flex ${statusTone(status)}`}>
            {statusLabel(status)}
          </span>
        </div>
        <div className="mx-auto flex max-w-3xl gap-2 overflow-x-auto px-3 pb-3 sm:px-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <Link
            href={`/sell/create?edit=${encodeURIComponent(listing.id)}`}
            className="inline-flex h-9 shrink-0 items-center rounded-full bg-gradient-to-r from-gold to-gold-bright px-4 text-xs font-bold text-zinc-950"
          >
            Full editor
          </Link>
          <button
            type="button"
            onClick={() => void copyPublicLink()}
            className="inline-flex h-9 shrink-0 items-center rounded-full border border-white/12 px-4 text-xs font-semibold text-zinc-200"
          >
            Copy buyer link
          </button>
          <Link
            href={publicHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 shrink-0 items-center rounded-full border border-white/12 px-4 text-xs font-semibold text-zinc-400"
          >
            Preview listing
          </Link>
          {offers > 0 ? (
            <button
              type="button"
              onClick={() => setOffersOpen(true)}
              className="inline-flex h-9 shrink-0 items-center rounded-full border border-rose-400/30 bg-rose-950/30 px-4 text-xs font-bold text-rose-100"
            >
              {offers} offers
            </button>
          ) : null}
        </div>
      </header>

      <div className="relative mx-auto max-w-3xl space-y-4 px-3 py-5 pb-24 sm:px-4">
        <section className="flex gap-3 rounded-2xl border border-white/[0.08] bg-[#0a0a0d]/90 p-3">
          <div className="relative size-20 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-[#0b0b0e]">
            {thumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={thumb} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-zinc-600">—</div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex rounded-md border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide sm:hidden ${statusTone(status)}`}>
                {statusLabel(status)}
              </span>
              <span className="text-[10px] text-zinc-500">{listing.category}</span>
              <span className="text-zinc-700">·</span>
              <span className="inline-flex rounded-md border border-emerald-400/25 bg-emerald-950/25 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-100/90">
                Buy now
              </span>
              {listing.allowOffers ? (
                <span className="inline-flex rounded-md border border-sky-400/25 bg-sky-950/30 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-sky-100/90">
                  Offers on
                </span>
              ) : null}
              {listing.acceptTradeOffers ? (
                <span className="inline-flex rounded-md border border-amber-400/25 bg-amber-950/30 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-100/90">
                  Trades on
                </span>
              ) : null}
              {listing.buyingFormat === "auction" ? (
                <span className="inline-flex rounded-md border border-zinc-500/25 bg-zinc-900/50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-zinc-400">
                  Legacy auction
                </span>
              ) : null}
            </div>
            {status === "awaiting_auction_payment" && listing.auctionPaymentDeadlineIso ? (
              <p className="mt-2 text-[11px] text-amber-200/90">
                Winner payment window · <PaymentDeadlineCountdown deadlineIso={listing.auctionPaymentDeadlineIso} />
              </p>
            ) : null}
            {listing.fulfillmentWarnings?.length ? (
              <ul className="mt-2 space-y-1 text-[10px] text-amber-100/90">
                {listing.fulfillmentWarnings.map((w) => (
                  <li key={w.code}>{w.message}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </section>

        <section className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Performance">
          {metrics.map((m) => (
            <div key={m.label} className="rounded-xl border border-white/[0.08] bg-[#0a0a0d]/80 px-3 py-3 text-center">
              <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-600">{m.label}</p>
              <p className="mt-1 font-mono text-xl font-bold tabular-nums text-foreground">{m.value}</p>
            </div>
          ))}
        </section>

        <StudioSection title="Pricing">
          <label className="block text-xs font-medium text-zinc-400">
            Buy now price (USD)
            <input
              type="number"
              min={1}
              step={1}
              value={priceUsd}
              onChange={(e) => setPriceUsd(e.target.value)}
              className="mt-1 h-11 w-full rounded-xl border border-white/10 bg-[#0c0c10] px-3 text-sm text-foreground outline-none focus:border-gold/35"
            />
          </label>
          {listing.buyingFormat === "auction" ? (
            <p className="text-[11px] text-amber-200/90">
              This is a legacy marketplace auction listing. New listings are buy now only — use Live Shows for auctions.
            </p>
          ) : null}
          <button
            type="button"
            disabled={busy || (listing.buyingFormat === "auction" && bidCount > 0)}
            onClick={savePricing}
            className="mt-2 inline-flex h-10 w-full items-center justify-center rounded-xl border border-gold/35 bg-gold/10 text-sm font-bold text-gold-bright disabled:opacity-50"
          >
            Save pricing
          </button>
        </StudioSection>

        <StudioSection title="Offers & trades">
          <p className="text-xs text-zinc-500">Control optional buyer actions on the marketplace listing page.</p>
          <div className="mt-3 space-y-3">
            <label className="flex items-center gap-3 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={listing.allowOffers === true}
                onChange={(e) => void patchListing({ allowOffers: e.target.checked })}
                disabled={busy}
                className="size-4 rounded border-white/20 accent-gold"
              />
              Accept offers
            </label>
            <label className={`flex items-center gap-3 text-sm text-zinc-300 ${listing.price < 500 ? "opacity-50" : ""}`}>
              <input
                type="checkbox"
                checked={listing.allowLayaway === true}
                onChange={(e) => void patchListing({ allowLayaway: e.target.checked })}
                disabled={busy || listing.buyingFormat !== "buy_now" || listing.price < 500}
                className="size-4 rounded border-white/20 accent-gold"
              />
              Allow layaway ($500+)
            </label>
            <label className="flex items-center gap-3 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={listing.acceptTradeOffers === true}
                onChange={(e) => void patchListing({ acceptTradeOffers: e.target.checked })}
                disabled={busy}
                className="size-4 rounded border-white/20 accent-gold"
              />
              Accept trades
            </label>
          </div>
        </StudioSection>

        <StudioSection title="Shipping">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-medium text-zinc-400">
              Shipping price (USD)
              <input
                type="number"
                min={0}
                step={0.01}
                value={shippingUsd}
                onChange={(e) => setShippingUsd(e.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-white/10 bg-[#0c0c10] px-3 text-sm text-foreground outline-none focus:border-gold/35"
              />
            </label>
            <label className="block text-xs font-medium text-zinc-400">
              Handling time
              <input
                value={handlingTime}
                onChange={(e) => setHandlingTime(e.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-white/10 bg-[#0c0c10] px-3 text-sm text-foreground outline-none focus:border-gold/35"
              />
            </label>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={saveShipping}
            className="mt-2 inline-flex h-10 w-full items-center justify-center rounded-xl border border-white/12 bg-white/[0.04] text-sm font-semibold text-zinc-200 disabled:opacity-50"
          >
            Save shipping
          </button>
        </StudioSection>

        <StudioSection title="Inventory & visibility">
          <p className="text-xs text-zinc-500">Control whether buyers can discover and purchase this listing.</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {canPause ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (!window.confirm("Move this listing to drafts? It will be hidden from the marketplace.")) return;
                  void patchListing({ status: "draft" });
                }}
                className="inline-flex h-10 flex-1 items-center justify-center rounded-xl border border-white/12 text-sm font-semibold text-zinc-300 disabled:opacity-50"
              >
                Pause (draft)
              </button>
            ) : null}
            {status === "draft" ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void patchListing({ status: listing.buyingFormat === "auction" ? "auction_live" : "active" })}
                className="inline-flex h-10 flex-1 items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-950/25 text-sm font-semibold text-emerald-100 disabled:opacity-50"
              >
                Publish
              </button>
            ) : null}
            {canMarkSold ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (!window.confirm("Mark this listing as sold?")) return;
                  void patchListing({ status: "sold" });
                }}
                className="inline-flex h-10 flex-1 items-center justify-center rounded-xl border border-white/12 text-sm font-semibold text-zinc-400 disabled:opacity-50"
              >
                Mark sold
              </button>
            ) : null}
          </div>
          <ListingLifecycleControls
            listing={listing}
            status={status}
            bidCount={bidCount}
            endRequest={endRequest}
            busy={busy}
            onBusy={setBusy}
            onReload={reload}
          />
        </StudioSection>

        <StudioSection title="Assign to live show">
          <p className="text-xs text-zinc-500">Queue this inventory in your host console during a live vault event.</p>
          {liveRooms.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-400">No scheduled or live rooms yet.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {liveRooms.map((room) => (
                <li key={room.id} className="flex items-center justify-between gap-2 rounded-xl border border-white/[0.06] bg-black/30 px-3 py-2.5">
                  <span className="min-w-0 truncate text-sm text-zinc-200">{room.title}</span>
                  <span className="shrink-0 text-[10px] font-bold uppercase text-zinc-500">{room.status}</span>
                  <Link
                    href={
                      room.roomType === "break"
                        ? `/seller/live/${encodeURIComponent(room.id)}/console`
                        : `/live/${encodeURIComponent(room.id)}`
                    }
                    className="shrink-0 rounded-full border border-gold/30 px-3 py-1 text-[10px] font-bold text-gold-bright"
                  >
                    {room.roomType === "break" ? "Host console" : "Open room"}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link
            href="/seller/live"
            className="mt-3 inline-flex h-10 items-center justify-center rounded-xl border border-white/12 px-4 text-sm font-semibold text-zinc-300"
          >
            Manage live shows
          </Link>
        </StudioSection>

        <StudioSection title="Share & promote">
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => void copyPublicLink()}
              className="inline-flex h-10 flex-1 items-center justify-center rounded-xl bg-gold/15 text-sm font-bold text-gold-bright"
            >
              Copy buyer link
            </button>
            <Link
              href={publicHref}
              target="_blank"
              className="inline-flex h-10 flex-1 items-center justify-center rounded-xl border border-white/12 text-sm font-semibold text-zinc-300"
            >
              Open buyer page
            </Link>
          </div>
        </StudioSection>

        {showRecovery ? (
          <StudioSection title="Auction recovery">
            <ExpiredAuctionRecoveryPanel listingId={listing.id} onDone={() => void reload()} />
          </StudioSection>
        ) : null}

        <StudioSection title="Danger zone">
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (!window.confirm("Delete this listing permanently? This cannot be undone.")) return;
              void (async () => {
                setBusy(true);
                try {
                  const res = await fetch(`/api/listings/${encodeURIComponent(listingId)}`, { method: "DELETE" });
                  if (!res.ok) throw new Error("Delete failed.");
                  notifyListingsUpdated();
                  router.push("/seller/listings");
                  router.refresh();
                } catch (e) {
                  toast(e instanceof Error ? e.message : "Delete failed.");
                } finally {
                  setBusy(false);
                }
              })();
            }}
            className="inline-flex h-10 w-full items-center justify-center rounded-xl border border-rose-400/35 bg-rose-950/20 text-sm font-semibold text-rose-200 disabled:opacity-50"
          >
            Delete listing
          </button>
        </StudioSection>
      </div>

      <SellerOffersModal
        open={offersOpen}
        onClose={() => setOffersOpen(false)}
        listingId={listing.id}
        listingTitle={listing.title}
        onChanged={() => void reload()}
      />
    </div>
  );
}

function StudioSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/[0.08] bg-[#0a0a0d]/90 p-4">
      <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function ListingLifecycleControls({
  listing,
  status,
  bidCount,
  endRequest,
  busy,
  onBusy,
  onReload,
}: {
  listing: StoredUserListing;
  status: SellerListingStatus;
  bidCount: number;
  endRequest: EndRequest | null;
  busy: boolean;
  onBusy: (v: boolean) => void;
  onReload: () => void;
}) {
  const router = useRouter();
  const isAuction = listing.buyingFormat === "auction";
  const hasBids = bidCount > 0;
  const pending = endRequest?.status === "pending";

  const endListing = async () => {
    onBusy(true);
    try {
      const res = await fetch(`/api/listings/${encodeURIComponent(listing.id)}/end`, { method: "POST" });
      const j = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(j?.error ?? "Could not end listing.");
      toast("Listing ended.");
      await onReload();
      notifyListingsUpdated();
      router.refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not end listing.");
    } finally {
      onBusy(false);
    }
  };

  if (status === "ended") {
    return <p className="mt-3 text-sm text-zinc-500">This listing has ended and is hidden from discovery.</p>;
  }

  if (pending) {
    return <p className="mt-3 text-sm text-amber-200/90">End request pending review — auction stays live until approved.</p>;
  }

  const canDirectEnd =
    (listing.buyingFormat === "buy_now" && status === "active") ||
    (isAuction && status === "auction_live" && !hasBids);

  return (
    <div className="mt-3 space-y-2">
      {isAuction && hasBids ? (
        <p className="text-[11px] text-zinc-500">
          Auctions with active bids require a reviewed end request to protect bidders.
        </p>
      ) : null}
      {canDirectEnd ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            if (!window.confirm("End this listing? Buyers will no longer be able to purchase.")) return;
            void endListing();
          }}
          className="inline-flex h-10 w-full items-center justify-center rounded-xl border border-rose-400/35 text-sm font-semibold text-rose-200 disabled:opacity-50"
        >
          End listing
        </button>
      ) : null}
      {isAuction && status === "auction_live" && hasBids ? (
        <Link
          href={`/sell/create?edit=${encodeURIComponent(listing.id)}`}
          className="inline-flex h-10 w-full items-center justify-center rounded-xl border border-white/12 text-sm font-semibold text-zinc-400"
        >
          Request early end (full editor)
        </Link>
      ) : null}
    </div>
  );
}
