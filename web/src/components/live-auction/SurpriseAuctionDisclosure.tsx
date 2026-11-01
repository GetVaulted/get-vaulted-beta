"use client";

import { useEffect, useMemo, useState } from "react";
import type { LiveRoomItemDTO } from "@/lib/live-room-serialize";
import { RANDOM_REVEAL_DISCLOSURE } from "@/lib/random-purchase-compliance";
import { computeSurpriseSetOdds, formatOddsPercent } from "../../../../shared/surprise-set";

/** True for a Surprise Set sold as an auction (one unit per round, winner gets a random draw). */
export function isSurpriseAuctionDto(item: Pick<LiveRoomItemDTO, "salesFormat" | "surpriseSetItems"> | null | undefined): boolean {
  return Boolean(item && item.salesFormat === "auction" && item.surpriseSetItems?.length);
}

/**
 * Shown above the bid controls while a Surprise Set auction is the live lot: what the winner gets,
 * live odds per item, and the one-time 18+ confirmation the server requires before bidding.
 */
export function SurpriseAuctionDisclosure({
  item,
  signedIn,
}: {
  item: Pick<LiveRoomItemDTO, "id" | "salesFormat" | "surpriseSetItems" | "quantity" | "status"> & {
    randomSpotClaims?: ReadonlyArray<{ label: string }>;
  };
  signedIn: boolean;
}) {
  const [adultConfirmed, setAdultConfirmed] = useState<boolean | null>(null);
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    fetch("/api/account/adult-confirmation", { credentials: "include", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { confirmed?: unknown } | null) => {
        if (!cancelled) setAdultConfirmed(j ? j.confirmed === true : null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  const odds = useMemo(
    () =>
      item.surpriseSetItems?.length
        ? computeSurpriseSetOdds(item.surpriseSetItems, (item.randomSpotClaims ?? []).map((c) => c.label))
        : null,
    [item.surpriseSetItems, item.randomSpotClaims],
  );

  const confirm = async () => {
    setSaving(true);
    setError(null);
    try {
      const r = await fetch("/api/account/adult-confirmation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ confirm: true }),
      });
      if (!r.ok) throw new Error();
      setAdultConfirmed(true);
    } catch {
      setError("Couldn’t save — try again.");
    } finally {
      setSaving(false);
    }
  };

  if (!isSurpriseAuctionDto(item) || item.status === "sold") return null;

  return (
    <div
      className="pointer-events-auto fixed bottom-24 right-4 z-[60] w-[min(340px,calc(100vw-2rem))] rounded-xl border border-amber-300/25 bg-[#0a0a0c]/95 p-3 text-left shadow-[0_8px_40px_rgba(0,0,0,0.6)] backdrop-blur"
      role="region"
      aria-label="Surprise Set auction details"
    >
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="flex w-full items-center justify-between gap-2 text-left"
        aria-expanded={!collapsed}
      >
        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-300">
          Surprise Set auction
        </span>
        <span className="text-[10px] font-semibold text-zinc-500">{collapsed ? "Show odds" : "Hide"}</span>
      </button>
      {!collapsed ? (
        <>
          <p className="mt-1.5 text-xs font-semibold text-zinc-200">
            Win the bid and you get one random item from this set — revealed live once your payment goes through.
          </p>
          <p className="mt-1 text-[11px] text-zinc-400">{RANDOM_REVEAL_DISCLOSURE}</p>
          {odds ? (
            <div className="mt-2">
              <p className="text-[10px] font-extrabold uppercase tracking-wide text-zinc-500">
                What’s left · odds ({odds.remainingUnits} unit{odds.remainingUnits === 1 ? "" : "s"})
              </p>
              <ul className="mt-1 max-h-32 divide-y divide-white/[0.06] overflow-y-auto">
                {odds.rows.map((r) => (
                  <li key={r.name} className="flex items-baseline justify-between gap-3 py-1 text-xs text-zinc-200">
                    <span className="min-w-0 truncate">{r.name}</span>
                    <span className="shrink-0 font-mono text-[11px] text-zinc-400">
                      {r.remaining} left · {formatOddsPercent(r.odds)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : null}
      {signedIn && adultConfirmed === false ? (
        <div className="mt-3 border-t border-white/10 pt-2">
          <label className="flex cursor-pointer items-start gap-2 text-xs text-zinc-200">
            <input
              id="surprise-auction-adult-confirm"
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="mt-0.5 rounded border-white/20 bg-[#0c0c10]"
            />
            <span>I’m 18 or older and I understand the winner gets a random item.</span>
          </label>
          <button
            type="button"
            disabled={!checked || saving}
            onClick={() => void confirm()}
            className="mt-2 w-full rounded-lg bg-amber-300 py-1.5 text-xs font-black uppercase tracking-wide text-black disabled:opacity-40"
          >
            {saving ? "Saving…" : "Confirm to bid"}
          </button>
          {error ? <p className="mt-1 text-[11px] text-rose-300">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
