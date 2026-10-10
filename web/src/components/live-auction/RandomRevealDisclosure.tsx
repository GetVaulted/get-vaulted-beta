"use client";

import { useMemo } from "react";
import { RANDOM_REVEAL_DISCLOSURE } from "@/lib/random-purchase-compliance";
import type { LiveRoomItemDTO } from "@/lib/live-room-serialize";
import { computeSurpriseSetOdds, formatOddsPercent } from "../../../../shared/surprise-set";

type Props = {
  item: Pick<LiveRoomItemDTO, "surpriseSetItems" | "variants"> & {
    randomSpotClaims?: ReadonlyArray<{ label: string }>;
  };
  /** null while the server answer is loading. */
  adultConfirmed: boolean | null;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** Noun for the pool, e.g. "team" — used for the equal-odds line on team / division / player breaks. */
  spotNounSingular: string;
};

/** Odds + 18+ confirmation shown above the buy button on every random-reveal purchase. */
export function RandomRevealDisclosure({ item, adultConfirmed, checked, onCheckedChange, spotNounSingular }: Props) {
  const surprise = item.surpriseSetItems;
  const odds = useMemo(
    () =>
      surprise?.length
        ? computeSurpriseSetOdds(surprise, (item.randomSpotClaims ?? []).map((c) => c.label))
        : null,
    [surprise, item.randomSpotClaims],
  );
  const remainingPool = useMemo(
    () => (item.variants ?? []).reduce((sum, v) => sum + Math.max(0, v.quantityRemaining), 0),
    [item.variants],
  );

  return (
    <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-left">
      <p className="text-[11px] font-semibold text-zinc-300">{RANDOM_REVEAL_DISCLOSURE}</p>

      {odds ? (
        <div className="mt-2">
          <p className="text-[10px] font-extrabold uppercase tracking-wide text-zinc-500">
            What’s left · your odds ({odds.remainingUnits} unit{odds.remainingUnits === 1 ? "" : "s"})
          </p>
          <ul className="mt-1 divide-y divide-white/[0.06]">
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
      ) : remainingPool > 0 ? (
        <p className="mt-2 text-[11px] text-zinc-400">
          Each of the {remainingPool} remaining {spotNounSingular}
          {remainingPool === 1 ? "" : "s"} is equally likely — 1 in {remainingPool}.
        </p>
      ) : null}

      {adultConfirmed === false ? (
        <label className="mt-3 flex cursor-pointer items-start gap-2 text-xs text-zinc-200">
          <input
            id="random-reveal-adult-confirm"
            type="checkbox"
            checked={checked}
            onChange={(e) => onCheckedChange(e.target.checked)}
            className="mt-0.5 rounded border-white/20 bg-[#0c0c10]"
          />
          <span>I’m 18 or older and I understand this is a random draw.</span>
        </label>
      ) : null}
    </div>
  );
}
