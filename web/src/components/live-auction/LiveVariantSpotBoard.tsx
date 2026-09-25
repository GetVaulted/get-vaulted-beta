"use client";

import { useState } from "react";
import type { LiveRoomItemDTO } from "@/lib/live-room-serialize";
import { isVariantSalesFormat, variantBuyerSelectLabel, hostSpotBoardPinEnabled } from "@/lib/live-item-variant-presets";
import { buildVariantSpotDisplayRows, formatSoldSpotBuyerLabel, formatUnavailableSpotLabel } from "@/lib/live-variant-spot-board";
import { MentionComposer } from "@/components/mentions/MentionComposer";
import type { MentionSearchUser } from "@/lib/mentions/mention-types";

export type MarkSoldArgs = {
  variantId: string;
  username: string;
  priceUsd: number;
  settlementMethod: string;
  zeroReason?: string;
  note?: string;
};

const SETTLEMENT_METHODS: { id: string; label: string }[] = [
  { id: "venmo", label: "Venmo" },
  { id: "paypal", label: "PayPal" },
  { id: "cash_app", label: "Cash App" },
  { id: "cash", label: "Cash" },
  { id: "zelle", label: "Zelle" },
  { id: "other", label: "Other" },
];

const ZERO_REASONS: { id: string; label: string }[] = [
  { id: "giveaway", label: "Giveaway" },
  { id: "comp", label: "Comp" },
  { id: "mistake", label: "Mistake" },
  { id: "other", label: "Other" },
];

type LiveVariantSpotBoardProps = {
  item: LiveRoomItemDTO | null;
  pinned?: boolean;
  hostMode?: boolean;
  /** Buyer @username — sold tiles they own get a Yours highlight. */
  highlightUsername?: string | null;
  onToggleHot?: (variantId: string, isHot: boolean) => void;
  /** Host taps an open spot to pin it for buyers (exclusive). */
  onPinVariant?: (variantId: string) => void;
  pinBusy?: boolean;
  minimized?: boolean;
  onToggleMinimized?: () => void;
  onAddSupplemental?: () => void;
  onRepeatSupplemental?: () => void;
  /** Short label for the repeat button, e.g. "Extra random · $25". Repeat button hides without it. */
  repeatSupplementalLabel?: string | null;
  hostBusy?: boolean;
  onEditSpots?: () => void;
  /** Live room id — enables the username autocomplete strip in the Mark Sold form. */
  liveRoomId?: string;
  /** Host marks an open spot sold off-platform (cash/Venmo/etc.) to a specific username. */
  onMarkSold?: (args: MarkSoldArgs) => void | Promise<void>;
  markSoldBusy?: boolean;
};

function fmtMoney(n: number) {
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

/** Host / stage spot list — compact pills matching mobile buyer checkout picker. */
export function LiveVariantSpotBoard({
  item,
  hostMode = false,
  highlightUsername = null,
  onToggleHot,
  onPinVariant,
  pinBusy = false,
  minimized = false,
  onToggleMinimized,
  onAddSupplemental,
  onRepeatSupplemental,
  repeatSupplementalLabel,
  hostBusy = false,
  onEditSpots,
  liveRoomId,
  onMarkSold,
  markSoldBusy = false,
}: LiveVariantSpotBoardProps) {
  const [markSoldVariantId, setMarkSoldVariantId] = useState<string | null>(null);
  const [markSoldUsername, setMarkSoldUsername] = useState("");
  const [markSoldPriceUsd, setMarkSoldPriceUsd] = useState("");
  const [markSoldMethod, setMarkSoldMethod] = useState<string | null>(null);
  const [markSoldZeroReason, setMarkSoldZeroReason] = useState<string | null>(null);
  const [markSoldNote, setMarkSoldNote] = useState("");
  const [markSoldError, setMarkSoldError] = useState<string | null>(null);

  if (!item || !isVariantSalesFormat(item.salesFormat) || !item.variants?.length) return null;

  const rows = buildVariantSpotDisplayRows(item, item.randomSpotClaims ?? []);
  const available = rows.filter((r) => !r.sold && !r.unavailable).length;
  const unavailableCount = rows.filter((r) => r.unavailable).length;
  const soldCount = rows.filter((r) => r.sold).length;
  const breakRoster =
    available <= 0 || Boolean(item.variantBreakReadyAt) || Boolean(item.variantBreakBeganAt);
  const boardLabel = breakRoster
    ? item.variantBreakBeganAt
      ? "Break roster"
      : "Sold roster"
    : variantBuyerSelectLabel(item.salesFormat);
  const canHostEdit = hostMode && !breakRoster;
  const viewerKey = highlightUsername?.trim().replace(/^@+/, "").toLowerCase() ?? "";

  const closeMarkSoldForm = () => {
    setMarkSoldVariantId(null);
    setMarkSoldUsername("");
    setMarkSoldPriceUsd("");
    setMarkSoldMethod(null);
    setMarkSoldZeroReason(null);
    setMarkSoldNote("");
    setMarkSoldError(null);
  };

  const openMarkSoldForm = (variantId: string, defaultPriceUsd: number) => {
    setMarkSoldVariantId(variantId);
    setMarkSoldUsername("");
    setMarkSoldPriceUsd(String(defaultPriceUsd));
    setMarkSoldMethod(null);
    setMarkSoldZeroReason(null);
    setMarkSoldNote("");
    setMarkSoldError(null);
  };

  const submitMarkSold = async () => {
    if (!markSoldVariantId || !onMarkSold) return;
    const username = markSoldUsername.trim().replace(/^@+/, "");
    if (username.length < 3) {
      setMarkSoldError("Enter the buyer's username.");
      return;
    }
    const priceUsd = Number(markSoldPriceUsd);
    if (!Number.isFinite(priceUsd) || priceUsd < 0) {
      setMarkSoldError("Enter a valid sale amount (use 0 for a free/comp).");
      return;
    }
    if (!markSoldMethod) {
      setMarkSoldError("Select how the buyer paid.");
      return;
    }
    if (priceUsd < 0.01 && !markSoldZeroReason) {
      setMarkSoldError("For a $0 sale, choose a reason.");
      return;
    }
    setMarkSoldError(null);
    await onMarkSold({
      variantId: markSoldVariantId,
      username,
      priceUsd,
      settlementMethod: markSoldMethod,
      zeroReason: priceUsd < 0.01 ? (markSoldZeroReason ?? undefined) : undefined,
      note: markSoldNote.trim() ? markSoldNote.trim().slice(0, 280) : undefined,
    });
    closeMarkSoldForm();
  };

  if (minimized) {
    return (
      <div className="pointer-events-auto flex max-w-lg items-center gap-2 rounded-full border border-white/10 bg-zinc-950/90 py-1.5 pl-3 pr-1.5 shadow-lg backdrop-blur-xl">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[10px] font-bold text-zinc-200">{item.title}</p>
          <p className="text-[9px] font-semibold text-emerald-300/90">
            {breakRoster
              ? `${rows.length} teams · tap Expand to view buyers`
              : `${available} open · ${rows.length} spots`}
          </p>
        </div>
        {canHostEdit && onRepeatSupplemental && repeatSupplementalLabel ? (
          <button
            type="button"
            disabled={hostBusy}
            onClick={onRepeatSupplemental}
            title={`Add another ${repeatSupplementalLabel}`}
            className="shrink-0 max-w-[6rem] truncate rounded-full border border-white/15 bg-white/5 px-2 py-1 text-[8px] font-black uppercase tracking-wide text-zinc-200 disabled:opacity-40"
          >
            +1 {repeatSupplementalLabel}
          </button>
        ) : null}
        {canHostEdit && onAddSupplemental ? (
          <button
            type="button"
            disabled={hostBusy}
            onClick={onAddSupplemental}
            className="shrink-0 rounded-full border border-amber-300/30 bg-amber-500/15 px-2 py-1 text-[8px] font-black uppercase tracking-wide text-amber-100 disabled:opacity-40"
          >
            + Supp
          </button>
        ) : null}
        {onToggleMinimized ? (
          <button
            type="button"
            onClick={onToggleMinimized}
            className="shrink-0 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[9px] font-black uppercase tracking-wide text-zinc-200"
          >
            Expand
          </button>
        ) : null}
      </div>
    );
  }

  const markSoldRow = markSoldVariantId ? rows.find((r) => r.variantId === markSoldVariantId) ?? null : null;

  return (
    <div className="pointer-events-auto w-full max-w-lg rounded-2xl border border-white/10 bg-zinc-950/92 p-3 shadow-xl backdrop-blur-xl">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-200/80">{boardLabel}</p>
          <p className="mt-0.5 truncate text-xs font-bold text-white">{item.title}</p>
          <p className="mt-0.5 text-[10px] font-semibold text-zinc-500">
            {breakRoster
              ? item.variantBreakBeganAt
                ? `Break in progress · ${soldCount} sold${unavailableCount ? ` · ${unavailableCount} unavailable` : ""}`
                : `All spots sold · ${soldCount} sold${unavailableCount ? ` · ${unavailableCount} unavailable` : ""}`
              : `${available} open · ${soldCount} sold${unavailableCount ? ` · ${unavailableCount} unavailable` : ""}`}
            {canHostEdit && onPinVariant ? " · use Pin on a team to feature it for buyers" : ""}
          </p>
        </div>
        {hostMode || onToggleMinimized ? (
          <div className="flex shrink-0 items-center gap-1">
            {canHostEdit && onEditSpots ? (
              <button
                type="button"
                disabled={hostBusy}
                onClick={onEditSpots}
                className="rounded-lg border border-amber-300/35 bg-amber-500/15 px-2 py-1 text-[8px] font-black uppercase tracking-wide text-amber-100 disabled:opacity-40"
              >
                Edit prices
              </button>
            ) : null}
            {canHostEdit && onRepeatSupplemental && repeatSupplementalLabel ? (
              <button
                type="button"
                disabled={hostBusy}
                onClick={onRepeatSupplemental}
                title={`Add another ${repeatSupplementalLabel}`}
                className="max-w-[8rem] truncate rounded-lg border border-white/15 bg-white/5 px-2 py-1 text-[8px] font-black uppercase tracking-wide text-zinc-200 disabled:opacity-40"
              >
                +1 {repeatSupplementalLabel}
              </button>
            ) : null}
            {canHostEdit && onAddSupplemental ? (
              <button
                type="button"
                disabled={hostBusy}
                onClick={onAddSupplemental}
                className="rounded-lg border border-amber-300/35 bg-amber-500/15 px-2 py-1 text-[8px] font-black uppercase tracking-wide text-amber-100 disabled:opacity-40"
              >
                Add Supp.
              </button>
            ) : null}
            {onToggleMinimized ? (
              <button
                type="button"
                onClick={onToggleMinimized}
                aria-label={hostMode ? "Minimize spot board" : "Close spot board"}
                className="rounded-lg border border-white/12 bg-black/40 px-2 py-1 text-[8px] font-black uppercase tracking-wide text-zinc-400 hover:text-zinc-200"
              >
                {hostMode ? "−" : "Close"}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="mt-3 flex max-h-[min(42vh,320px)] flex-wrap gap-2 overflow-y-auto pr-0.5">
        {rows.map((r) => {
          const closed = r.sold || r.unavailable;
          const pinned = r.isHot && !closed;
          const rowBuyer = r.buyerUsername?.trim().replace(/^@+/, "").toLowerCase() ?? "";
          const mine = Boolean(viewerKey && r.sold && rowBuyer === viewerKey);
          const canPin = hostSpotBoardPinEnabled({
            hostMode,
            hasPinHandler: Boolean(onPinVariant),
            variantId: r.variantId,
            sold: closed,
          });
          const canMarkSold = canHostEdit && Boolean(onMarkSold) && Boolean(r.variantId) && !closed;
          const tileClass = `relative min-w-[5.5rem] max-w-[48%] flex-grow rounded-full border px-3 py-2 ${
            mine
              ? "border-gold/70 bg-gold/15 ring-1 ring-gold/35"
              : r.unavailable
                ? "border-white/10 bg-white/[0.02] opacity-70"
                : r.sold
                  ? "border-emerald-400/25 bg-emerald-950/25"
                  : pinned
                    ? "border-amber-300/70 bg-amber-500/15 ring-1 ring-amber-300/40"
                    : r.isHot
                      ? "border-amber-400/40 bg-amber-500/10"
                      : "border-white/15 bg-white/[0.03]"
          }`;

          const inner = (
            <>
              {mine ? (
                <span className="absolute -top-1.5 right-2 rounded-full border border-gold/50 bg-gold px-1.5 py-0.5 text-[8px] font-black uppercase text-zinc-950">
                  Yours
                </span>
              ) : pinned ? (
                <span className="absolute -top-1.5 right-2 rounded-full border border-amber-200/40 bg-amber-400 px-1.5 py-0.5 text-[8px] font-black uppercase text-zinc-950">
                  Pinned
                </span>
              ) : r.isHot && !closed ? (
                <span className="absolute -top-1.5 right-2 rounded-full border border-white/20 bg-red-600 px-1.5 py-0.5 text-[8px] font-black uppercase text-white">
                  Hot
                </span>
              ) : null}
              <div className="flex items-start justify-between gap-1">
                <p className={`text-xs font-bold ${closed ? "text-zinc-400" : "text-zinc-100"}`}>{r.label}</p>
                {canHostEdit && onToggleHot && r.variantId && !onPinVariant && !closed ? (
                  <button
                    type="button"
                    onClick={() => onToggleHot(r.variantId!, !r.isHot)}
                    className="text-[9px] text-zinc-500 hover:text-amber-300"
                    aria-label={`Toggle hot for ${r.label}`}
                  >
                    ★
                  </button>
                ) : null}
              </div>
              <div className="mt-0.5 flex items-center justify-between gap-2">
                <p
                  className={`font-mono text-[10px] font-bold ${
                    r.unavailable
                      ? "text-zinc-500"
                      : r.sold
                        ? "text-emerald-200"
                        : "text-zinc-500"
                  }`}
                >
                  {r.unavailable
                    ? formatUnavailableSpotLabel()
                    : r.sold
                      ? formatSoldSpotBuyerLabel(r.buyerUsername)
                      : fmtMoney(r.priceUsd)}
                </p>
                <div className="flex shrink-0 items-center gap-1">
                  {canPin && r.variantId ? (
                    <button
                      type="button"
                      disabled={pinBusy}
                      onClick={() => onPinVariant!(r.variantId!)}
                      className={`shrink-0 rounded-full border px-2 py-0.5 text-[8px] font-black uppercase tracking-wide ${
                        pinned
                          ? "border-amber-300/55 bg-amber-500/20 text-amber-100"
                          : "border-white/15 bg-black/35 text-zinc-200 hover:border-amber-300/45"
                      }`}
                      aria-label={`Pin ${r.label} for buyers`}
                    >
                      {pinned ? "Pinned" : "Pin"}
                    </button>
                  ) : null}
                  {canMarkSold ? (
                    <button
                      type="button"
                      disabled={markSoldBusy}
                      onClick={() => openMarkSoldForm(r.variantId!, r.priceUsd)}
                      className="shrink-0 rounded-full border border-emerald-400/40 bg-emerald-500/15 px-2 py-0.5 text-[8px] font-black uppercase tracking-wide text-emerald-100 hover:border-emerald-300/60 disabled:opacity-40"
                      aria-label={`Mark ${r.label} sold to a username`}
                    >
                      Sold
                    </button>
                  ) : null}
                </div>
              </div>
            </>
          );

          return (
            <div key={r.id} className={tileClass}>
              {inner}
            </div>
          );
        })}
      </div>

      {markSoldRow ? (
        <div className="mt-3 rounded-xl border border-emerald-400/30 bg-emerald-950/20 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-200/90">
              Mark {markSoldRow.label} sold
            </p>
            <button
              type="button"
              onClick={closeMarkSoldForm}
              aria-label="Cancel mark sold"
              className="text-[10px] font-bold text-zinc-400 hover:text-zinc-200"
            >
              Cancel
            </button>
          </div>

          <div className="mt-2 flex flex-col gap-2">
            <div>
              <p className="mb-1 text-[9px] font-bold uppercase tracking-wide text-zinc-500">Buyer username</p>
              <MentionComposer
                value={markSoldUsername}
                onChange={setMarkSoldUsername}
                singleLine
                plainUsernameSearch
                liveRoomId={liveRoomId}
                placeholder="buyer_username"
                onPickUser={(user: MentionSearchUser) => setMarkSoldUsername(user.username)}
                className="w-full rounded-lg border border-white/15 bg-black/40 px-2.5 py-1.5 text-xs font-semibold text-white outline-none focus:border-emerald-300/50"
              />
            </div>

            <div>
              <p className="mb-1 text-[9px] font-bold uppercase tracking-wide text-zinc-500">Sale amount (USD)</p>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={markSoldPriceUsd}
                onChange={(e) => setMarkSoldPriceUsd(e.target.value)}
                className="w-full rounded-lg border border-white/15 bg-black/40 px-2.5 py-1.5 text-xs font-semibold text-white outline-none focus:border-emerald-300/50"
              />
            </div>

            <div>
              <p className="mb-1 text-[9px] font-bold uppercase tracking-wide text-zinc-500">How did they pay?</p>
              <div className="flex flex-wrap gap-1.5">
                {SETTLEMENT_METHODS.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMarkSoldMethod(m.id)}
                    className={`rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-wide ${
                      markSoldMethod === m.id
                        ? "border-emerald-300/70 bg-emerald-500/25 text-emerald-100"
                        : "border-white/15 bg-black/30 text-zinc-300 hover:border-white/30"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {Number(markSoldPriceUsd) < 0.01 ? (
              <div>
                <p className="mb-1 text-[9px] font-bold uppercase tracking-wide text-zinc-500">Reason for $0</p>
                <div className="flex flex-wrap gap-1.5">
                  {ZERO_REASONS.map((z) => (
                    <button
                      key={z.id}
                      type="button"
                      onClick={() => setMarkSoldZeroReason(z.id)}
                      className={`rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-wide ${
                        markSoldZeroReason === z.id
                          ? "border-amber-300/70 bg-amber-500/20 text-amber-100"
                          : "border-white/15 bg-black/30 text-zinc-300 hover:border-white/30"
                      }`}
                    >
                      {z.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div>
              <p className="mb-1 text-[9px] font-bold uppercase tracking-wide text-zinc-500">Note (optional)</p>
              <input
                type="text"
                value={markSoldNote}
                maxLength={280}
                onChange={(e) => setMarkSoldNote(e.target.value)}
                placeholder="e.g. paid via Venmo before stream"
                className="w-full rounded-lg border border-white/15 bg-black/40 px-2.5 py-1.5 text-xs font-semibold text-white outline-none focus:border-emerald-300/50"
              />
            </div>

            {markSoldError ? <p className="text-[10px] font-bold text-rose-300">{markSoldError}</p> : null}

            <button
              type="button"
              disabled={markSoldBusy}
              onClick={() => void submitMarkSold()}
              className="mt-1 rounded-lg border border-emerald-400/50 bg-emerald-500/25 px-3 py-2 text-[11px] font-black uppercase tracking-wide text-emerald-50 hover:bg-emerald-500/35 disabled:opacity-40"
            >
              {markSoldBusy ? "Marking sold…" : "Confirm sold"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
