"use client";

import type { ListingStatus } from "@/generated/prisma/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

export type TradePickerListing = {
  id: string;
  title: string;
  imageUrl: string | null;
  priceUsd: number;
  category: string;
  condition: string;
  status: ListingStatus;
  sellerId: string;
  sellerUsername: string;
  acceptTradeOffers: boolean;
};

type CashDirection = "none" | "i_add_cash" | "they_add_cash";

type TradeBuilderPageProps = {
  viewerId: string;
  prefillListingId: string | null;
  prefillError:
    | {
        message: string;
        listingHref: string;
      }
    | null;
  offeredOptions: TradePickerListing[];
  requestedOptions: TradePickerListing[];
};

function formatMoney(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function isTradeAvailableStatus(status: TradePickerListing["status"]): boolean {
  return status === "active" || status === "auction_live";
}

function ToggleCard({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-11 rounded-xl border px-4 text-sm font-semibold transition ${
        active
          ? "border-gold/45 bg-gold/12 text-gold-bright"
          : "border-white/10 bg-[#0f0f14] text-zinc-300 hover:border-white/20"
      }`}
    >
      {label}
    </button>
  );
}

export function TradeBuilderPage({
  viewerId,
  prefillListingId,
  prefillError,
  offeredOptions,
  requestedOptions,
}: TradeBuilderPageProps) {
  const router = useRouter();
  const [requestedIds, setRequestedIds] = useState<string[]>(prefillListingId ? [prefillListingId] : []);
  const [offeredIds, setOfferedIds] = useState<string[]>([]);
  const [cashDirection, setCashDirection] = useState<CashDirection>("none");
  const [cashAmount, setCashAmount] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [requestedPickerOpen, setRequestedPickerOpen] = useState(false);
  const [offeredPickerOpen, setOfferedPickerOpen] = useState(false);

  const requestedById = useMemo(() => new Map(requestedOptions.map((l) => [l.id, l])), [requestedOptions]);
  const offeredById = useMemo(() => new Map(offeredOptions.map((l) => [l.id, l])), [offeredOptions]);

  const selectedRequested = useMemo(
    () => requestedIds.map((id) => requestedById.get(id)).filter((v): v is TradePickerListing => Boolean(v)),
    [requestedById, requestedIds],
  );
  const selectedOffered = useMemo(
    () => offeredIds.map((id) => offeredById.get(id)).filter((v): v is TradePickerListing => Boolean(v)),
    [offeredById, offeredIds],
  );

  const requestedOwnerId = selectedRequested[0]?.sellerId ?? null;
  const requestedOwnerName = selectedRequested[0]?.sellerUsername ?? null;
  const requestedValue = selectedRequested.reduce((sum, item) => sum + item.priceUsd, 0);
  const offeredValue = selectedOffered.reduce((sum, item) => sum + item.priceUsd, 0);
  const parsedCash = Number(cashAmount);
  const cashIsValid = cashAmount.trim() === "" || (Number.isFinite(parsedCash) && parsedCash >= 0);
  const effectiveCashAmount = cashAmount.trim() === "" ? 0 : Number.isFinite(parsedCash) ? Math.max(0, parsedCash) : 0;

  const inlineErrors = useMemo(() => {
    const errors: string[] = [];
    if (requestedIds.length < 1 || requestedIds.length > 5) {
      errors.push("Select 1 to 5 requested items.");
    }
    if (offeredIds.length < 1 || offeredIds.length > 5) {
      errors.push("Select 1 to 5 offered items.");
    }
    if (selectedRequested.some((l) => !isTradeAvailableStatus(l.status) || !l.acceptTradeOffers)) {
      errors.push("One or more requested items are no longer available for trades.");
    }
    if (selectedOffered.some((l) => !isTradeAvailableStatus(l.status))) {
      errors.push("One or more offered items are no longer available.");
    }
    const ownerIds = new Set(selectedRequested.map((l) => l.sellerId));
    if (ownerIds.size > 1) {
      errors.push("Requested items must belong to one seller.");
    }
    if (selectedRequested.some((l) => l.sellerId === viewerId)) {
      errors.push("You cannot request your own listings.");
    }
    if (!cashIsValid) {
      errors.push("Enter a valid non-negative cash amount.");
    }
    return errors;
  }, [cashIsValid, offeredIds.length, requestedIds.length, selectedOffered, selectedRequested, viewerId]);

  const tradeSummaryCash =
    cashDirection === "none" || effectiveCashAmount <= 0
      ? null
      : cashDirection === "i_add_cash"
      ? `You add ${formatMoney(effectiveCashAmount)}`
      : `They add ${formatMoney(effectiveCashAmount)}`;

  const onSubmit = async () => {
    setSubmitError(null);
    if (inlineErrors.length > 0) {
      setSubmitError(inlineErrors[0] ?? "Please fix the form and try again.");
      return;
    }
    setBusy(true);
    try {
      const proposerCashUsd = cashDirection === "i_add_cash" ? effectiveCashAmount : 0;
      const recipientCashUsd = cashDirection === "they_add_cash" ? effectiveCashAmount : 0;
      const res = await fetch("/api/trade/offers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestedListingIds: requestedIds,
          offeredListingIds: offeredIds,
          proposerCashUsd,
          recipientCashUsd,
          messageToRecipient: message.trim() || null,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; redirectTo?: string };
      if (!res.ok || typeof j.redirectTo !== "string") {
        setSubmitError(j.error ?? "Could not send trade offer right now.");
        return;
      }
      router.push(j.redirectTo);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="relative flex min-h-0 flex-1 flex-col bg-[linear-gradient(180deg,rgba(14,14,18,0.55)_0%,#030303_38%,#030303_100%)]">
      <div className="mx-auto w-full max-w-[1100px] px-3 pb-28 pt-5 sm:px-4 lg:px-8">
        <header className="rounded-2xl border border-white/[0.08] bg-[#09090c]/90 p-4 sm:p-6">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Trade Builder</p>
          <h1 className="font-display mt-1 text-2xl font-black tracking-tight text-foreground">Build your trade offer</h1>
          <p className="mt-2 text-sm text-zinc-400">Choose cards from both sides, optionally add cash, and send a clean offer.</p>
        </header>

        {prefillError ? (
          <section className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-950/20 p-4">
            <p className="text-sm font-semibold text-amber-100">{prefillError.message}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href={prefillError.listingHref} className="rounded-full border border-amber-300/30 px-4 py-2 text-xs font-semibold text-amber-100 hover:bg-amber-500/10">
                Back to listing
              </Link>
              <Link href="/trade/new" className="rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-zinc-200 hover:border-gold/35 hover:text-gold-bright">
                Start blank trade
              </Link>
            </div>
          </section>
        ) : null}

        <section className="mt-5 space-y-4">
          <TradeSelectionSection
            title="1) Requested items"
            subtitle="Pick items you want from one seller."
            selected={selectedRequested}
            actionLabel="Choose requested items"
            onAction={() => setRequestedPickerOpen(true)}
            emptyText="No requested items selected."
          />

          <TradeSelectionSection
            title="2) Your offered items"
            subtitle="Pick your listings you want to offer."
            selected={selectedOffered}
            actionLabel="Choose your offered items"
            onAction={() => setOfferedPickerOpen(true)}
            emptyText="No offered items selected."
          />

          <section className="rounded-2xl border border-white/[0.08] bg-[#09090c]/85 p-4">
            <p className="text-sm font-semibold text-zinc-100">3) Optional cash adjustment</p>
            <p className="mt-1 text-xs text-zinc-500">Pick one side only so the final terms are unambiguous.</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <ToggleCard
                active={cashDirection === "none"}
                label="No cash"
                onClick={() => setCashDirection("none")}
              />
              <ToggleCard
                active={cashDirection === "i_add_cash"}
                label="I add cash"
                onClick={() => setCashDirection("i_add_cash")}
              />
              <ToggleCard
                active={cashDirection === "they_add_cash"}
                label="They add cash"
                onClick={() => setCashDirection("they_add_cash")}
              />
            </div>
            {cashDirection !== "none" ? (
              <div className="mt-3 max-w-xs">
                <label htmlFor="trade-cash-amount" className="text-xs font-semibold text-zinc-400">
                  Cash amount (USD)
                </label>
                <input
                  id="trade-cash-amount"
                  inputMode="decimal"
                  value={cashAmount}
                  onChange={(e) => setCashAmount(e.target.value)}
                  placeholder="0.00"
                  className="mt-1 h-11 w-full rounded-xl border border-white/10 bg-[#101015] px-3 text-sm text-zinc-100 outline-none ring-gold/20 focus:border-gold/35 focus:ring-2"
                />
              </div>
            ) : null}
          </section>

          <section className="rounded-2xl border border-white/[0.08] bg-[#09090c]/85 p-4">
            <p className="text-sm font-semibold text-zinc-100">4) Message</p>
            <p className="mt-1 text-xs text-zinc-500">Optional note to explain your trade idea.</p>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              maxLength={500}
              placeholder="Hey, I'd like to trade these cards for yours."
              className="mt-2 w-full rounded-xl border border-white/10 bg-[#101015] px-3 py-2.5 text-sm text-zinc-100 outline-none ring-gold/20 placeholder:text-zinc-600 focus:border-gold/35 focus:ring-2"
            />
          </section>

          <section className="rounded-2xl border border-white/[0.08] bg-[#09090c]/85 p-4">
            <p className="text-sm font-semibold text-zinc-100">5) Trade summary</p>
            <dl className="mt-3 space-y-1.5 text-xs text-zinc-400">
              <div className="flex items-center justify-between gap-3">
                <dt>Requested items</dt>
                <dd className="font-semibold text-zinc-200">{selectedRequested.length}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt>Your offered items</dt>
                <dd className="font-semibold text-zinc-200">{selectedOffered.length}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt>Requested total value</dt>
                <dd className="font-semibold text-zinc-200">{formatMoney(requestedValue)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt>Offered total value</dt>
                <dd className="font-semibold text-zinc-200">{formatMoney(offeredValue)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt>Counterparty</dt>
                <dd className="font-semibold text-zinc-200">
                  {requestedOwnerName ? `@${requestedOwnerName}` : "Not selected"}
                </dd>
              </div>
              {tradeSummaryCash ? (
                <div className="flex items-center justify-between gap-3">
                  <dt>Cash adjustment</dt>
                  <dd className="font-semibold text-gold-bright">{tradeSummaryCash}</dd>
                </div>
              ) : null}
            </dl>
          </section>
          <section className="rounded-2xl border border-white/[0.08] bg-[#09090c]/85 p-4">
            <p className="text-sm font-semibold text-zinc-100">Future messaging</p>
            <p className="mt-1 text-xs text-zinc-500">
              Trade chat is not part of MVP yet. Future messages will stay inside this trade between participants only.
            </p>
          </section>
        </section>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.08] bg-[#060608]/95 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur md:px-4">
        <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-2 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1 text-[11px] text-zinc-500">
            {submitError ? <p className="text-rose-300">{submitError}</p> : <p>Ready when your offer looks right.</p>}
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onSubmit()}
            className="inline-flex h-12 min-w-[150px] items-center justify-center rounded-full bg-gradient-to-r from-gold to-gold-bright px-6 text-sm font-bold text-zinc-950 shadow-[0_12px_34px_-14px_rgba(201,162,39,0.6)] transition hover:brightness-110 disabled:opacity-60"
          >
            {busy ? "Sending..." : "Send offer"}
          </button>
        </div>
      </div>

      <TradeItemPicker
        open={requestedPickerOpen}
        mode="requested"
        title="Choose requested items"
        subtitle="Select up to 5 items from one seller."
        options={requestedOptions}
        selectedIds={requestedIds}
        onClose={() => setRequestedPickerOpen(false)}
        onChange={setRequestedIds}
        viewerId={viewerId}
      />
      <TradeItemPicker
        open={offeredPickerOpen}
        mode="offered"
        title="Choose your offered items"
        subtitle="Select up to 5 of your active listings."
        options={offeredOptions}
        selectedIds={offeredIds}
        onClose={() => setOfferedPickerOpen(false)}
        onChange={setOfferedIds}
        viewerId={viewerId}
      />
    </main>
  );
}

function TradeSelectionSection({
  title,
  subtitle,
  selected,
  actionLabel,
  onAction,
  emptyText,
}: {
  title: string;
  subtitle: string;
  selected: TradePickerListing[];
  actionLabel: string;
  onAction: () => void;
  emptyText: string;
}) {
  return (
    <section className="rounded-2xl border border-white/[0.08] bg-[#09090c]/85 p-4">
      <p className="text-sm font-semibold text-zinc-100">{title}</p>
      <p className="mt-1 text-xs text-zinc-500">{subtitle}</p>
      <div className="mt-3 space-y-2">
        {selected.length === 0 ? (
          <p className="rounded-xl border border-dashed border-white/15 px-3 py-3 text-sm text-zinc-500">{emptyText}</p>
        ) : (
          selected.map((item) => (
            <div key={item.id} className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-black/20 p-2.5">
              <div className="size-12 overflow-hidden rounded-lg border border-white/10 bg-[#101014]">
                {item.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-[10px] text-zinc-600">No image</div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-zinc-100">{item.title}</p>
                <p className="text-[11px] text-zinc-500">
                  {item.condition} · {formatMoney(item.priceUsd)}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
      <button
        type="button"
        onClick={onAction}
        className="mt-3 inline-flex h-11 items-center justify-center rounded-full border border-white/15 px-5 text-sm font-semibold text-zinc-200 transition hover:border-gold/35 hover:text-gold-bright"
      >
        {actionLabel}
      </button>
    </section>
  );
}

function TradeItemPicker({
  open,
  mode,
  title,
  subtitle,
  options,
  selectedIds,
  onClose,
  onChange,
  viewerId,
}: {
  open: boolean;
  mode: "requested" | "offered";
  title: string;
  subtitle: string;
  options: TradePickerListing[];
  selectedIds: string[];
  onClose: () => void;
  onChange: (next: string[]) => void;
  viewerId: string;
}) {
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedRequestedOwnerId = useMemo(() => {
    if (mode !== "requested") return null;
    const chosen = options.find((opt) => selectedSet.has(opt.id));
    return chosen?.sellerId ?? null;
  }, [mode, options, selectedSet]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-end bg-black/70 sm:items-center sm:justify-center sm:p-4">
      <button type="button" className="absolute inset-0" onClick={onClose} aria-label="Close picker" />
      <section className="relative z-[1] flex h-[88vh] w-full flex-col rounded-t-3xl border border-white/[0.12] bg-[#09090c] p-4 sm:h-[80vh] sm:max-h-[720px] sm:w-[min(100%,680px)] sm:rounded-2xl">
        <div className="mb-3 flex items-center justify-between gap-2 border-b border-white/[0.08] pb-3">
          <div>
            <p className="text-sm font-semibold text-zinc-100">{title}</p>
            <p className="text-xs text-zinc-500">{subtitle}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-white/15 px-3 py-1.5 text-xs font-semibold text-zinc-300">
            Done
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {options.length === 0 ? (
            <p className="rounded-xl border border-dashed border-white/15 px-3 py-4 text-sm text-zinc-500">
              {mode === "offered"
                ? "You don’t have eligible listings yet. Create or activate a listing first."
                : "No trade-enabled listings are available right now."}
            </p>
          ) : null}
          {options.map((item) => {
            const selected = selectedSet.has(item.id);
            const overMax = !selected && selectedIds.length >= 5;
            const requestedWrongOwner =
              mode === "requested" &&
              selectedRequestedOwnerId != null &&
              selectedRequestedOwnerId !== item.sellerId &&
              !selected;
            const unavailable = !isTradeAvailableStatus(item.status);
            const blockedSelfTrade = mode === "requested" && item.sellerId === viewerId;
            const blockedTradeDisabled = mode === "requested" && !item.acceptTradeOffers;
            const blocked = overMax || requestedWrongOwner || unavailable || blockedSelfTrade || blockedTradeDisabled;

            let blockedReason = "";
            if (overMax) blockedReason = "Max 5 items per side.";
            else if (requestedWrongOwner) blockedReason = "Requested items must be from one seller.";
            else if (blockedSelfTrade) blockedReason = "You can’t request your own listing.";
            else if (blockedTradeDisabled) blockedReason = "Seller is not accepting trades on this listing.";
            else if (unavailable) blockedReason = "Listing is unavailable.";

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (blocked) return;
                  if (selected) onChange(selectedIds.filter((id) => id !== item.id));
                  else onChange([...selectedIds, item.id]);
                }}
                disabled={blocked}
                className={`w-full rounded-xl border p-2.5 text-left transition ${
                  selected
                    ? "border-gold/45 bg-gold/10"
                    : blocked
                    ? "cursor-not-allowed border-white/[0.05] bg-[#0c0c11] opacity-60"
                    : "border-white/[0.08] bg-[#101016] hover:border-white/20"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="size-14 overflow-hidden rounded-lg border border-white/10 bg-[#0d0d12]">
                    {item.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-[10px] text-zinc-600">No image</div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-zinc-100">{item.title}</p>
                    <p className="text-[11px] text-zinc-500">
                      @{item.sellerUsername} · {item.condition} · {formatMoney(item.priceUsd)}
                    </p>
                    {blockedReason ? <p className="mt-1 text-[11px] text-amber-200">{blockedReason}</p> : null}
                  </div>
                  <span
                    className={`inline-flex size-6 items-center justify-center rounded-full border text-xs ${
                      selected ? "border-gold/45 bg-gold/20 text-gold-bright" : "border-white/20 text-zinc-500"
                    }`}
                  >
                    {selected ? "✓" : "+"}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
